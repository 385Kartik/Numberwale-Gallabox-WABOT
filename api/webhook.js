import { parseUserMessage } from './utils/aiParser.js';
import { fetchNumbers, formatNumbersReply } from './utils/searchApi.js';
import { isShowMoreIntent, isBotPaused } from './utils/sessionStore.js';
import { getCustomerContext, logInteraction } from './utils/analytics.js';

// Vercel Serverless Function entry point
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const payload = req.body;
    const body = typeof payload === 'string' ? JSON.parse(payload) : payload;

    console.log('[Webhook] Raw payload received:', JSON.stringify(body, null, 2));

    // Try to extract message text from various possible Gallabox payload structures
    const userMessage = body?.whatsapp?.text?.body ||
                        body?.message?.text || 
                        body?.text || 
                        body?.payload?.text || 
                        body?.data?.message?.text || 
                        body?.payload?.message?.text ||
                        body?.message?.payload?.text;

    const customerPhone = body?.whatsapp?.from ||
                          body?.contact?.phone || 
                          body?.phone || 
                          body?.data?.contact?.phone ||
                          body?.payload?.contact?.phone;

    const channelID = body?.channelId

    if (!userMessage) {
      console.log('[Webhook] No message text found. Ignoring.');
      return res.status(200).json({ success: true, reason: 'no_message' });
    }

    // ── Bot Pause Check ───────────────────────────────────────────────────
    if (customerPhone && isBotPaused(customerPhone)) {
      console.log(`[Webhook] Bot is PAUSED for ${customerPhone}. Skipping — agent is handling.`);
      return res.status(200).json({ success: true, reason: 'bot_paused' });
    }

    // ── Whitelist Check ───────────────────────────────────────────────────
    // During testing: only respond to numbers in ALLOWED_PHONES env var.
    // Format: comma-separated, e.g. "919876543210,918888888888"
    // Remove this block (or clear ALLOWED_PHONES) to go live for everyone.
    const allowedPhones = process.env.ALLOWED_PHONES;
    if (allowedPhones) {
      console.log(allowedPhones);
      
      const whitelist = allowedPhones.split(',').map(p => p.trim());
      console.log("whitelist is" + whitelist);
      
      if (!whitelist.includes(customerPhone)) {
        console.log(`[Webhook] ${customerPhone} not in whitelist. Skipping silently.`);
        return res.status(200).json({ success: true, reason: 'not_whitelisted' });
      }
    }

    console.log(`[Webhook] From ${customerPhone || 'Unknown'}: "${userMessage}"`);

    let jsonQuery;
    let page = 1;
    const customerName = body?.contact?.name || 'Unknown';
    
    // Fetch state from MongoDB (avoids Vercel stateless wiping)
    const customerContext = await getCustomerContext(customerPhone, customerName);

    let parsedTokens = 0;
    let parsedModel = null;

    // ── "Show More" handling ──────────────────────────────────────────────
    if (isShowMoreIntent(userMessage)) {
      const activeFilters = customerContext.activeFilters;
      if (!activeFilters || Object.keys(activeFilters).length === 0) {
        const replyText = "Pehle koi search karo, phir *'show more'* likho! 😊\nExample: _req 99 two times_";
        console.log('[Webhook] Show more requested but no session found.');
        return res.status(200).json({ success: true, reply: replyText });
      }

      jsonQuery = activeFilters;
      page = (customerContext.lastPage || 1) + 1;
      console.log(`[Webhook] Show more: page ${page} for query`, jsonQuery);

    // ── Pre-flight: Catch greetings / conversational text without using AI ────
    } else if (/^(hi|hello|hey|hola|namaste|thanks|thank you|ok|okay|k|good|bye|what is my pin code|help)\b/i.test(userMessage.trim())) {
      console.log('[Webhook] Pre-flight caught conversational message, bypassing AI.');
      const errReply = "Namaste! 🙏 Main Numberwale ka AI assistant hun. Main sirf VIP mobile numbers search karne mein aapki madad kar sakta hun.\n\nAapko kaisa number chahiye? (e.g. _req 555_ ya _mirror numbers under 10000_)";
      
      await logInteraction({
        phone: customerPhone, name: customerName,
        userText: userMessage, botText: "Sent conversational greeting",
        isFail: true, model: null, tokensUsed: 0
      }).catch(() => {});

      const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
      const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
      const channelID = body?.channelId;
      if (GALLABOX_API_KEY && GALLABOX_API_SECRET && channelID && customerPhone) {
        const { default: axios } = await import('axios');
        await axios.post(
          'https://server.gallabox.com/devapi/messages/whatsapp',
          { channelId: channelID, channelType: 'whatsapp', recipient: { name: customerPhone, phone: customerPhone }, whatsapp: { type: 'text', text: { body: errReply } } },
          { headers: { 'apiKey': GALLABOX_API_KEY, 'apiSecret': GALLABOX_API_SECRET, 'Content-Type': 'application/json' } }
        ).catch(() => {});
      }
      return res.status(200).json({ success: true, reason: 'conversational_bypass' });

    // ── Fresh search or Follow-up search (AI Parsing) ────────────────────────
    } else {
      try {
        // Pass ONLY current DB JSON state to AI
        const parsed = await parseUserMessage(userMessage, customerContext.activeFilters);
        
        jsonQuery = parsed.result;

        // JS Fallback Merge: If the AI forgot the category and only returned price/freq, merge it forcefully
        const isOnlyRefinement = Object.keys(jsonQuery).every(k => ['minPrice', 'maxPrice', 'digitFreq1Digit', 'digitFreq1Count', 'mustContain', 'notContain'].includes(k));
        if (isOnlyRefinement && customerContext.activeFilters && Object.keys(customerContext.activeFilters).length > 0) {
          console.log('[Webhook] AI forgot state. Force merging in JS.');
          jsonQuery = { ...customerContext.activeFilters, ...jsonQuery };
        }

        page = 1;
        parsedTokens = parsed.tokensUsed;
        parsedModel = parsed.model;
        
        console.log('[Webhook] AI parsed query:', jsonQuery);

        // Check if query was unrelated (AI returned empty JSON)
        const hasFilters = Object.values(jsonQuery).some(val => val !== null && val !== "" && val !== 0);
        if (!hasFilters) {
          console.log('[Webhook] AI returned empty filters (unrelated query).');
          const errReply = "Maafi chahta hun, main Numberwale ka AI assistant hun aur sirf VIP mobile numbers search karne mein aapki madad kar sakta hun. 🙏\nKya aapko koi specific number chahiye? Jaise: _req 555_ ya _mirror numbers_";
          
           await logInteraction({
          phone: customerPhone, name: customerName,
          userText: userMessage, botText: "Sent fallback error (parsing failed)",
          isFail: true, model: parsedModel, tokensUsed: parsedTokens
        }).catch(() => {});

          const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
          const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
          const channelID = body?.channelId;
          if (GALLABOX_API_KEY && GALLABOX_API_SECRET && channelID && customerPhone) {
            const { default: axios } = await import('axios');
            await axios.post(
              'https://server.gallabox.com/devapi/messages/whatsapp',
              { channelId: channelID, channelType: 'whatsapp', recipient: { name: customerPhone, phone: customerPhone }, whatsapp: { type: 'text', text: { body: errReply } } },
              { headers: { 'apiKey': GALLABOX_API_KEY, 'apiSecret': GALLABOX_API_SECRET, 'Content-Type': 'application/json' } }
            ).catch(() => {});
          }
          return res.status(200).json({ success: true, reason: 'unrelated_query_ignored' });
        }

      } catch (parseErr) {
        console.error('[Webhook] AI parse failed:', parseErr.message);
        
        await logInteraction({
          phone: customerPhone, name: customerName,
          userText: userMessage, botText: `Parse Error: ${parseErr.message}`,
          isFail: true
        }).catch(() => {});

        const errReply = "Maafi chahta hun, aapki query samajh nahi aayi. Kripya dobara try karein. 🙏\nExample: _req 99 three times under 5000_";
        // Still need to send back to user via Gallabox
        const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
        const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
        const channelID = body?.channelId;
        if (GALLABOX_API_KEY && GALLABOX_API_SECRET && channelID && customerPhone) {
          const { default: axios } = await import('axios');
          await axios.post(
            'https://server.gallabox.com/devapi/messages/whatsapp',
            { channelId: channelID, channelType: 'whatsapp', recipient: { name: customerPhone, phone: customerPhone }, whatsapp: { type: 'text', text: { body: errReply } } },
            { headers: { 'apiKey': GALLABOX_API_KEY, 'apiSecret': GALLABOX_API_SECRET, 'Content-Type': 'application/json' } }
          ).catch(() => {});
        }
        return res.status(200).json({ success: true, reason: 'parse_failed' });
      }
    }

    // ── Fetch from backend ────────────────────────────────────────────────
    const result = await fetchNumbers(jsonQuery, page);
    console.log(`[Webhook] Fetched ${result.products.length} products (page ${page}/${result.totalPages})`);

    // (State is now saved automatically via logInteraction at the end)

    // ── Format reply ──────────────────────────────────────────────────────
    if (result.products.length === 0 && page > 1) {
      const replyText = "Yahi tak the numbers! Koi aur search karo. 😊";
      return res.status(200).json({ success: true, reply: replyText });
    }

    const replyText = formatNumbersReply(
      result.products,
      result.totalCount,
      result.currentPage,
      result.totalPages
    );

    console.log(`[Webhook] Reply:\n${replyText}`);

    // ── Send reply to Gallabox ────────────────────────────────────────────
    const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
    const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
    const GALLABOX_CHANNEL_ID = channelID;
console.log("this is the API key" + GALLABOX_API_KEY + GALLABOX_API_SECRET);
    if (GALLABOX_API_KEY && GALLABOX_API_SECRET && GALLABOX_CHANNEL_ID && customerPhone) {
      try {
        const { default: axios } = await import('axios');
        await axios.post(
          'https://server.gallabox.com/devapi/messages/whatsapp',
          {
            channelId: GALLABOX_CHANNEL_ID,
            channelType: "whatsapp",
            recipient: {
              name: customerPhone,
              phone: customerPhone
            },
            whatsapp: {
              type: "text",
              text: { body: replyText }
            }
          },
          {
            headers: {
              'apiKey': GALLABOX_API_KEY,
              'apiSecret': GALLABOX_API_SECRET,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`[Webhook] ✅ Reply sent to ${customerPhone} via Gallabox`);
        
        
      } catch (sendErr) {
        console.error('[Webhook] ❌ Failed to send via Gallabox:', sendErr.response?.data || sendErr.message);
      }
    } else {
      console.log('[Webhook] ⚠️  Gallabox credentials missing — skipping outbound send.');
    }

    // ── Log optimized interaction and Save DB State ───────────────
    const optimizedBotText = `✨ ${result.totalCount} numbers found for category '${jsonQuery?.category || 'generic'}' (Page ${result.currentPage}/${result.totalPages})`;
    await logInteraction({
      phone: customerPhone,
      name: customerName,
      userText: userMessage,
      botText: optimizedBotText,
      isFail: false,
      model: parsedModel,
      tokensUsed: parsedTokens,
      jsonQuery: jsonQuery, // Saves activeFilters
      page: result.currentPage // Saves lastPage
    }).catch(() => {});

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[Webhook] Fatal Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
