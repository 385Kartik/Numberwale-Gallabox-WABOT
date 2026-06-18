import { parseUserMessage } from './utils/aiParser.js';
import { fetchNumbers, formatNumbersReply } from './utils/searchApi.js';
import { isShowMoreIntent, isBotPaused, pauseBot } from './utils/sessionStore.js';
import { getCustomerContext, logInteraction, updateCustomerInfo, resetActiveFilters } from './utils/analytics.js';
import { generateUPIQRCodeUrl, createRazorpayPaymentLink, fetchProductByNumber } from './utils/paymentUtils.js';

// ── Intent Detectors ────────────────────────────────────────────────────────
function extractBuyNumber(text) {
  const m = text.trim().match(/(?:buy|purchase)\s*(?:this)?\s*(\d{10})/i);
  return m ? m[1] : null;
}

// Vercel Serverless Function entry point
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const payload = req.body;
    const body = typeof payload === 'string' ? JSON.parse(payload) : payload;

    console.log('[Webhook] Raw payload received:', JSON.stringify(body, null, 2));

    let rawMsg = body?.whatsapp?.text?.body ||
                 body?.message?.text?.body ||
                 body?.message?.text || 
                 body?.text || 
                 body?.payload?.text || 
                 body?.data?.message?.text || 
                 body?.payload?.message?.text ||
                 body?.message?.payload?.text;
                 
    const userMessage = typeof rawMsg === 'object' ? rawMsg?.body : rawMsg;

    const customerPhone = body?.whatsapp?.from ||
                          body?.whatsapp?.to ||
                          body?.contact?.phone || 
                          body?.phone || 
                          body?.data?.contact?.phone ||
                          body?.payload?.contact?.phone;

    const channelID = body?.channelId

    if (!userMessage) {
      console.log('[Webhook] No message text found. Ignoring.');
      return res.status(200).json({ success: true, reason: 'no_message' });
    }

    const allowedPhones = process.env.ALLOWED_PHONES;
    if (allowedPhones) {
      const whitelist = allowedPhones.split(',').map(p => p.trim());
      if (!whitelist.includes(customerPhone)) {
        console.log(`[Webhook] ${customerPhone} not in whitelist. Skipping silently.`);
        return res.status(200).json({ success: true, reason: 'not_whitelisted' });
      }
    }

    console.log(`[Webhook] From ${customerPhone || 'Unknown'}: "${userMessage}"`);

    const lowerMsg = userMessage.toLowerCase().trim();

    // Fetch state from MongoDB early
    const customerName = body?.contact?.name || 'Unknown';
    const customerContext = await getCustomerContext(customerPhone, customerName);
    let currentState = customerContext.botState;

    const isOutbound = body?.direction === 'OUTBOUND' || 
                       body?.message?.direction === 'outbound' || 
                       body?.message?.type === 'sent' ||
                       (body?.whatsapp?.to && !body?.whatsapp?.from) ||
                       (body?.sender && body?.contactId && body.sender !== body.contactId);
    const isStatusEvent = body?.event && !['message', 'message_received'].includes(body.event);
    
    if (isOutbound) {
      if (lowerMsg === '#bot on') {
        console.log(`[Webhook] Employee resumed bot for ${customerPhone}.`);
        await updateCustomerInfo(customerPhone, { botState: 'ACTIVE' });
        const resumeMsg = "👋 Hi! Main AI assistant wapas aa gaya hun.\n\nAapko kaise VIP mobile numbers chahiye?";
        await sendToGallabox(customerPhone, resumeMsg, channelID);
        return res.status(200).json({ success: true });
      }
      console.log('[Webhook] Ignoring regular outbound message.');
      return res.status(200).json({ success: true, reason: 'outbound' });
    }

    if (isStatusEvent) {
      return res.status(200).json({ success: true, reason: 'status_event' });
    }

    if (currentState === 'PAUSED') {
      console.log(`[Webhook] Bot is PAUSED for ${customerPhone}. Skipping — agent is handling.`);
      return res.status(200).json({ success: true, reason: 'bot_paused' });
    }

    // ── Global Commands ───────────────────────────────────────────────────
    const agentRegex = /^(agent|human|talk|call|help|customer care|executive|insan|bhai|bhaiya)\b/i;
    const resetRegex = /^(menu|restart|reset|clear|start)\b/i;

    if (agentRegex.test(lowerMsg)) {
      await updateCustomerInfo(customerPhone, { botState: 'PAUSED' });
      // Call Gallabox API to add REQUIRE_AGENT tag to contact
      await addGallaboxTag(customerPhone, "REQUIRE_AGENT", channelID);

      const errReply = "Aapki conversation hamare human agent ko transfer ki ja rahi hai. Kripya thoda intezaar karein. 🙏";
      await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
    }

    if (resetRegex.test(lowerMsg) && currentState === 'ACTIVE') {
      await resetActiveFilters(customerPhone);
      const errReply = "✅ Aapka pichla search reset kar diya gaya hai.\n\nAap naya number kaisa chahte hain? (e.g., 'need mirror numbers under 5000')";
      await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
    }

    // ── State Machine: Onboarding ─────────────────────────────────────────
    if (currentState === 'NEW') {
      const welcomeReply = "Welcome to Numberwale! 🙏\n\nHum aapko best VIP mobile numbers dhundhne mein madad karenge.\n\nKripya apna *Naam* aur *6-digit Pincode* type karke bhejein taaki hum local availability check kar sakein.\n\nExample: _Rahul 131001_";
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_INFO' });
      await sendToGallabox(customerPhone, welcomeReply, channelID);
        return res.status(200).json({ success: true });
    }

    if (currentState === 'AWAITING_INFO') {
      // Look for a 6 digit number
      const pinMatch = userMessage.match(/\b\d{6}\b/);
      // Look for a name (any alphabetic word)
      const nameMatch = userMessage.match(/\b[A-Za-z]+\b/);

      if (pinMatch && nameMatch) {
        const extractedPin = pinMatch[0];
        const extractedName = nameMatch[0];
        
        await updateCustomerInfo(customerPhone, { 
          botState: 'ACTIVE', 
          pinCode: extractedPin, 
          name: extractedName 
        });

        const instructions = `Awesome, ${extractedName}! Aapka Pincode ${extractedPin} save ho gaya hai. 🎉\n\nAap kaise VIP number dhoondh rahe hain? Aap mujhe bata sakte hain:\n\n` +
          `🔹 _"Need mirror numbers under 5000"_\n` +
          `🔹 _"9999 ending without 4 and 8"_\n` +
          `🔹 _"Sum 5 numbers"_\n\n` +
          `Type kijiye aur hum numbers fetch karenge!`;
        await sendToGallabox(customerPhone, instructions, channelID);
        return res.status(200).json({ success: true });
      } else {
        const errReply = "❌ Invalid format.\n\nKripya apna *Naam* aur *6-digit Pincode* ek sath likh kar bhejein.\nExample: _Rahul 131001_";
        await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
      }
    }

    // If state is ACTIVE, proceed normally
    let jsonQuery;
    let page = 1;
    let parsedTokens = 0;
    let parsedModel = null;

    // ── "Show More" handling ──────────────────────────────────────────────
    if (isShowMoreIntent(userMessage)) {
      const activeFilters = customerContext.activeFilters;
      if (!activeFilters || Object.keys(activeFilters).length === 0) {
        const replyText = "Pehle koi search karo, phir *'show more'* likho! 😊\nExample: _req 99 two times_";
        console.log('[Webhook] Show more requested but no session found.');
        await sendToGallabox(customerPhone, replyText, channelID);
        return res.status(200).json({ success: true });
      }

      jsonQuery = activeFilters;
      page = (customerContext.lastPage || 1) + 1;
      console.log(`[Webhook] Show more: page ${page} for query`, jsonQuery);

    // ── "Buy" intent: buy <10-digit-number> ───────────────────────────────
    } else if (extractBuyNumber(userMessage)) {
      const buyNumber = extractBuyNumber(userMessage);
      console.log(`[Webhook] Buy intent for number: ${buyNumber}`);

      try {
        const product = await fetchProductByNumber(buyNumber);
        if (!product || !product.price) {
          const errMsg = `❌ *${buyNumber}* nahi mila ya already sold out ho gaya hai.\n\nDobara search karo: _req ${buyNumber.slice(-4)}_`;
          await sendToGallabox(customerPhone, errMsg, channelID);
          return res.status(200).json({ success: true });
        }

        // Calculate GST and Total Amount (product.price is the subtotal)
        const subtotal = product.price;
        const gstPercentage = 18; // Fixed 18% GST as per backend
        const gstAmount = Math.round(subtotal * (gstPercentage / 100));
        const totalAmount = subtotal + gstAmount;

        const paymentLink = await createRazorpayPaymentLink({
          number: buyNumber,
          price: totalAmount, // Pass totalAmount with GST to Razorpay
          customerPhone,
          customerName
        });

        const qrUrl = generateUPIQRCodeUrl(totalAmount, `VIP Number ${buyNumber}`, req.headers.host);

        let priceBreakdown = ``;
        const effDiscount = product.myDiscount !== 0 && product.myDiscount ? product.myDiscount : product.vendorDiscount;
        
        if (effDiscount && product.basePrice) {
          const discountAmt = Math.round(product.basePrice * (effDiscount / 100));
          priceBreakdown += `*Price Breakdown:*\n` +
            `💰 Base Price: ₹${product.basePrice.toLocaleString('en-IN')}\n` +
            `🏷️ Discount: ${effDiscount}% (-₹${discountAmt.toLocaleString('en-IN')})\n` +
            `🧾 Subtotal: ₹${subtotal.toLocaleString('en-IN')}\n` +
            `🏛️ GST (18%): ₹${gstAmount.toLocaleString('en-IN')}\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ *Total Amount: ₹${totalAmount.toLocaleString('en-IN')}*\n\n`;
        } else {
          priceBreakdown += `*Price Breakdown:*\n` +
            `🧾 Subtotal: ₹${subtotal.toLocaleString('en-IN')}\n` +
            `🏛️ GST (18%): ₹${gstAmount.toLocaleString('en-IN')}\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ *Total Amount: ₹${totalAmount.toLocaleString('en-IN')}*\n\n`;
        }

        const caption = `🛒 *Payment Link & QR Ready!*\n\n` +
          `📱 Number: *${buyNumber}*\n\n` +
          priceBreakdown +
          `GPay / PhonePe / Paytm se is UPI ID par direct pay kar sakte hain:\n` +
          `_UPI: msnumberwale.eazypay@icici_\n\n` +
          `💳 *Or Pay via Razorpay:*\n${paymentLink}\n\n` +
          `⚠️ _Yeh link 24 ghante valid hai._`;

        const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
        const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
        const { default: axios } = await import('axios');

        if (GALLABOX_API_KEY && GALLABOX_API_SECRET && channelID) {
          await axios.post('https://server.gallabox.com/devapi/messages/whatsapp',
            { 
              channelId: channelID, 
              channelType: 'whatsapp', 
              recipient: { name: customerPhone, phone: customerPhone }, 
              whatsapp: { 
                type: 'image', 
                image: { 
                  link: qrUrl, 
                  caption: caption 
                } 
              } 
            },
            { headers: { 'apiKey': GALLABOX_API_KEY, 'apiSecret': GALLABOX_API_SECRET, 'Content-Type': 'application/json' } }
          ).catch((e) => console.error('[Webhook] Image Send Error:', e.message));
        } else {
          await sendToGallabox(customerPhone, caption, channelID);
        }

        console.log(`[Webhook] Buy reply sent for ${buyNumber}`);
      } catch (buyErr) {
        console.error('[Webhook] Buy intent error:', buyErr.message);
        const errMsg = `❌ Payment link generate nahi hua. Thodi der baad try karo.`;
        await sendToGallabox(customerPhone, errMsg, channelID);
        return res.status(200).json({ success: true });
      }
      return res.status(200).json({ success: true });

    // ── Fresh search or Follow-up search (AI Parsing) ─────────────────────
    } else {
      try {
        const parsed = await parseUserMessage(userMessage, customerContext.activeFilters);
        
        jsonQuery = parsed.result;
        parsedTokens = parsed.tokens || 0;
        parsedModel = parsed.modelUsed;

        // Remove empty strings from jsonQuery
        if (jsonQuery && typeof jsonQuery === 'object') {
          for (const key in jsonQuery) {
            if (jsonQuery[key] === "" || jsonQuery[key] === null) {
              delete jsonQuery[key];
            }
          }
        }

        if (customerContext.activeFilters?.category && !jsonQuery.category) {
          jsonQuery.category = customerContext.activeFilters.category;
        }

        if (!jsonQuery || Object.keys(jsonQuery).length === 0) {
          const errReply = "Maafi chahta hun, aapki query samajh nahi aayi. Kripya pura likhein. 💡\nExample: _req numbers ending with 555_";
          await sendToGallabox(customerPhone, errReply, channelID);
          return res.status(200).json({ success: true });
        }
      } catch (parseErr) {
        console.error('[Webhook] NLP Parse Error:', parseErr);
        const errReply = "Maafi chahta hun, aapki query samajh nahi aayi. Kripya dobara try karein. 🙏\nExample: _req 99 three times under 5000_";
        await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
      }
    }

    // ── Fetch results from external API ───────────────────────────────────
    const result = await fetchNumbers(jsonQuery, page);
    console.log(`[Webhook] Fetched ${result.products?.length || 0} products (page ${page}/${result.totalPages})`);

    // ── Format reply ──────────────────────────────────────────────────────
    if (!result.products || result.products.length === 0) {
      if (page > 1) {
        const replyText = "Yahi tak the numbers! Koi aur search karo. 😊";
        await sendToGallabox(customerPhone, replyText, channelID);
        return res.status(200).json({ success: true });
      } else {
        const emptyMsg = `Oops! Aapke criteria (${JSON.stringify(jsonQuery)}) se match karte hue numbers abhi available nahi hain. 😔\n\nKoi dusra pattern try karein (e.g., _req 9999_).`;
        await sendToGallabox(customerPhone, emptyMsg, channelID);
        return res.status(200).json({ success: true });
      }
    }

    const replyText = formatNumbersReply(
      result.products, 
      result.totalCount, 
      page, 
      result.totalPages
    );

    await sendToGallabox(customerPhone, replyText, channelID);

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

// ── Helper Function ─────────────────────────────────────────────────────────
async function sendToGallabox(phone, text, channelId) {
  const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
  const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
  
  if (GALLABOX_API_KEY && GALLABOX_API_SECRET && channelId && phone) {
    try {
      const { default: axios } = await import('axios');
      await axios.post(
        'https://server.gallabox.com/devapi/messages/whatsapp',
        {
          channelId: channelId,
          channelType: "whatsapp",
          recipient: { name: phone, phone: phone },
          whatsapp: { type: "text", text: { body: text } }
        },
        {
          headers: {
            'apiKey': GALLABOX_API_KEY,
            'apiSecret': GALLABOX_API_SECRET,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`[Webhook] 📤 Reply sent to ${phone} via Gallabox`);
    } catch (sendErr) {
      console.error('[Webhook] ❌ Failed to send via Gallabox:', sendErr.response?.data || sendErr.message);
    }
  } else {
    console.log('[Webhook] ⚠️ Gallabox credentials missing — skipping outbound send.');
  }
}

// ── Tag Helper Function ─────────────────────────────────────────────────────
async function addGallaboxTag(phone, tagName, channelId) {
  const GALLABOX_API_KEY    = process.env.GALLABOX_API_KEY;
  const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
  const ACCOUNT_ID          = process.env.GALLABOX_ACCOUNT_ID; // Need account ID for tagging

  if (!GALLABOX_API_KEY || !GALLABOX_API_SECRET) {
    console.log('[Webhook] ⚠️ Missing Gallabox API keys for tagging.');
    return;
  }

  try {
    const { default: axios } = await import('axios');
    
    // Many WhatsApp CRMs allow updating tags via their Contacts API.
    // For Gallabox specifically, we assume a standard PUT / contacts route.
    // Replace the URL with exact Gallabox endpoint if known.
    // Example using generic contact tag update:
    await axios.post(
      `https://server.gallabox.com/devapi/contacts/tags`, 
      {
        phone: phone,
        tags: [tagName]
      },
      {
        headers: {
          'apiKey': GALLABOX_API_KEY,
          'apiSecret': GALLABOX_API_SECRET,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`[Webhook] 🏷️ Tag '${tagName}' added to ${phone} in Gallabox.`);
  } catch (err) {
    console.error('[Webhook] ❌ Failed to add Gallabox tag:', err.response?.data || err.message);
    // Silent fail so we don't break the user experience
  }
}
