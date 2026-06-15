import { parseUserMessage } from './utils/aiParser.js';
import { fetchNumbers, formatNumbersReply } from './utils/searchApi.js';
import { saveSession, getSession, isShowMoreIntent, isBotPaused } from './utils/sessionStore.js';

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

    const customerPhone = body.contact?.phone || 
                          body.phone || 
                          body.data?.contact?.phone ||
                          body.payload?.contact?.phone;

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
      const whitelist = allowedPhones.split(',').map(p => p.trim());
      if (!whitelist.includes(customerPhone)) {
        console.log(`[Webhook] ${customerPhone} not in whitelist. Skipping silently.`);
        return res.status(200).json({ success: true, reason: 'not_whitelisted' });
      }
    }

    console.log(`[Webhook] From ${customerPhone || 'Unknown'}: "${userMessage}"`);

    let jsonQuery;
    let page = 1;

    // ── "Show More" handling ──────────────────────────────────────────────
    if (isShowMoreIntent(userMessage)) {
      const session = getSession(customerPhone);

      if (!session || !session.jsonQuery) {
        const replyText = "Pehle koi search karo, phir *'show more'* likho! 😊\nExample: _req 99 two times_";
        console.log('[Webhook] Show more requested but no session found.');
        return res.status(200).json({ success: true, reply: replyText });
      }

      jsonQuery = session.jsonQuery;
      page = (session.page || 1) + 1;
      console.log(`[Webhook] Show more: page ${page} for query`, jsonQuery);

    // ── Fresh search ──────────────────────────────────────────────────────
    } else {
      jsonQuery = await parseUserMessage(userMessage);
      page = 1;
      console.log('[Webhook] AI parsed query:', jsonQuery);
    }

    // ── Fetch from backend ────────────────────────────────────────────────
    const result = await fetchNumbers(jsonQuery, page);
    console.log(`[Webhook] Fetched ${result.products.length} products (page ${page}/${result.totalPages})`);

    // ── Save session (always update after every search/show more) ─────────
    if (customerPhone) {
      saveSession(customerPhone, { jsonQuery, page });
    }

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
    const GALLABOX_CHANNEL_ID = process.env.GALLABOX_CHANNEL_ID;

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

    return res.status(200).json({ success: true, reply: replyText });

  } catch (error) {
    console.error('[Webhook] Fatal Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
