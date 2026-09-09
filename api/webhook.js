import { parseUserMessage } from './utils/aiParser.js';
import { fetchNumbers, formatNumbersReply } from './utils/searchApi.js';
import { 
  detectCustomerIntent, 
  detectLanguage,
  generateFaqReply, 
  generateNumerologyReply, 
  formatConversationalSearchResults,
  generateSalesAgentResponse
} from './utils/agentEngine.js';
import { isShowMoreIntent, isBotPaused, pauseBot, resumeBot } from './utils/sessionStore.js';
import { getCustomerContext, logInteraction, updateCustomerInfo, resetActiveFilters, storeBotMessageId, isBotMessageId, saveConversationId, touchInteraction, stopDrip } from './utils/analytics.js';
import { createRazorpayPaymentLink, fetchProductByNumber } from './utils/paymentUtils.js';
import { sendToGallabox, unassignConversation, addGallaboxTag } from './utils/gallabox.js';

// ── Intent Detectors ────────────────────────────────────────────────────────
function extractBuyNumber(text) {
  const buyKeywords = [
    'buy', 'purchase', 'kharidna', 'kharidne', 'kharid', 'kharidi', 'lenahai', 'lena', 'le', 'want',
    'खरीदना', 'खरीदें', 'खरीद', 'बाय', 'लेना', 'ખરીદવા', 'ખરીદો', 'બાય', 'લેવો', 'લેવોછે', 'ખરેદી', 'खरेदी', 'घ्यायचा', 'घ्यायचे'
  ];
  
  const keywordsPattern = buyKeywords.join('|');
  
  // Case 1: Keyword before the number
  const prefixRegex = new RegExp(`(?:${keywordsPattern})\\s*(?:this|it|number)?\\s*([\\d\\s\\-]{10,15})`, 'i');
  
  // Case 2: Number before the keyword
  const suffixRegex = new RegExp(`([\\d\\s\\-]{10,15})\\s*(?:this|it|number)?\\s*(?:${keywordsPattern})`, 'i');

  let match = text.trim().match(prefixRegex);
  if (!match) {
    match = text.trim().match(suffixRegex);
  }

  if (match) {
    const cleanNum = match[1].replace(/\D/g, '');
    if (cleanNum.length === 10) return cleanNum;
  }
  return null;
}

// Vercel Serverless Function entry point
export default async function handler(req, res) {
  const reqStartTime = Date.now();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const payload = req.body;
    const body = typeof payload === 'string' ? JSON.parse(payload) : payload;

    console.log('[Webhook] Raw payload received:', JSON.stringify(body, null, 2));

    const eventType = (
      req.headers['x-event-name'] ||
      body?.event ||
      body?.type ||
      body?.event_type ||
      ''
    ).toString();
    const eventLower = eventType.toLowerCase();

    // ── Detect outbound events FIRST ──
    const isOutbound =
      body?.direction === 'OUTBOUND' ||
      body?.message?.direction === 'outbound' ||
      body?.message?.type === 'sent' ||
      eventLower.includes('sent') ||
      eventLower.includes('send') ||
      (body?.whatsapp?.to && !body?.whatsapp?.from) ||
      (body?.request?.data?.whatsapp?.to && !body?.request?.data?.whatsapp?.from) ||
      (body?.sender && body?.contactId && body.sender !== body.contactId);

    // ── Customer Phone Normalization ──
    // On Outbound: customer is recipient ('to'). On Inbound: customer is sender ('from').
    let rawCustomerPhone = isOutbound
      ? (body?.whatsapp?.to ||
         body?.request?.data?.whatsapp?.to ||
         body?.recipient?.phone ||
         body?.contact?.phone ||
         body?.phone ||
         body?.data?.contact?.phone ||
         body?.payload?.contact?.phone)
      : (body?.whatsapp?.from ||
         body?.request?.data?.whatsapp?.from ||
         body?.contact?.phone ||
         body?.phone ||
         body?.data?.contact?.phone ||
         body?.payload?.contact?.phone);

    const customerPhone = rawCustomerPhone ? String(rawCustomerPhone).replace(/\D/g, '') : null;

    let rawMsg = body?.whatsapp?.text?.body ||
                 body?.request?.data?.whatsapp?.text?.body ||
                 body?.data?.whatsapp?.text?.body ||
                 body?.message?.text?.body ||
                 body?.message?.text || 
                 body?.text || 
                 body?.payload?.text || 
                 body?.data?.message?.text || 
                 body?.payload?.message?.text ||
                 body?.message?.payload?.text;
                 
    const userMessage = (typeof rawMsg === 'object' ? rawMsg?.body : rawMsg) || '';

    const channelID = body?.channelId || body?.request?.data?.channelId || body?.data?.channelId;

    // ── Filter out genuine status events (delivery receipts, read receipts, typing) ──
    const isStatusEvent =
      eventLower.includes('delivered') ||
      eventLower.includes('read') ||
      eventLower.includes('failed') ||
      eventLower.includes('deleted') ||
      eventLower.includes('typing') ||
      (body?.event && ['delivered', 'read', 'delivery_receipt', 'read_receipt'].includes(body.event.toLowerCase()));

    if (isStatusEvent) {
      return res.status(200).json({ success: true, reason: 'status_event' });
    }

    // ── Handle Outbound Messages ──
    if (isOutbound) {
      // 1. Detect Drip Campaign / Broadcast / Marketing Template Messages
      const requestData = body.request?.data || body.data || body;
      const whatsappData = requestData.whatsapp || body.whatsapp || {};
      const templateData = whatsappData.template || body.template || {};
      const templateId = templateData.templateId || templateData.id || whatsappData.templateId || body.request?.data?.whatsapp?.template?.templateId;
      const isTemplate = whatsappData.type === 'template' || body.type === 'template' || !!templateId || !!whatsappData.template;

      if (isTemplate) {
        console.log(`[Webhook] Outbound message to ${customerPhone} is an automated template (${templateId || 'drip'}). Bot stays ACTIVE.`);
        return res.status(200).json({ success: true, reason: 'template_ignored' });
      }

      // 2. Detect if this echo is from the Bot itself
      const incomingLocalMsgId = body?.localMessageId ||
                                 body?.data?.localMessageId ||
                                 body?.message?.localMessageId ||
                                 body?.request?.data?.localMessageId;
      const isBotEcho = await isBotMessageId(customerPhone, incomingLocalMsgId);

      if (isBotEcho) {
        console.log(`[Webhook] Ignoring bot echo: ${incomingLocalMsgId}`);
        return res.status(200).json({ success: true, reason: 'bot_echo_ignored' });
      }

      // 3. #bot on command from Executive in Gallabox inbox
      if (userMessage && /^\s*#?bot[\s_]*on\b/i.test(userMessage.trim())) {
        console.log(`[Webhook] Employee resumed bot for ${customerPhone}.`);
        resumeBot(customerPhone);
        await updateCustomerInfo(customerPhone, { botState: 'ACTIVE', agentReplied: false });
        
        const customerContext = await getCustomerContext(customerPhone);
        const lang = customerContext.language || 'English';
        let resumeMsg = "👋 Hi! I am the AI assistant, back online.\n\nWhat kind of VIP mobile numbers are you looking for?";
        
        if (lang === 'English') {
          resumeMsg = "👋 Hi! I am the AI assistant, back online.\n\nWhat kind of VIP mobile numbers are you looking for?";
        } else if (lang === 'Hindi') {
          resumeMsg = "👋 नमस्ते! मैं AI असिस्टेंट वापस आ गया हूँ।\n\nआपको कैसा VIP मोबाइल नंबर चाहिए?";
        } else if (lang === 'Gujarati') {
          resumeMsg = "👋 નમસ્તે! હું AI આસિસ્ટન્ટ પાછો આવી ગયો છું.\n\nતમારે કેવા VIP મોબાઈલ નંબર જોઈએ છે?";
        } else if (lang === 'Marathi') {
          resumeMsg = "👋 नमस्कार! मी AI सहाय्यक परत आलो आहे.\n\nतुम्हाला कसा VIP मोबाईल नंबर हवा आहे?";
        } else if (lang === 'Hinglish') {
          resumeMsg = "👋 Hi! Main AI assistant wapas online aa gaya hun.\n\nAapko kis tarah ke VIP mobile numbers chahiye?";
        }
        
        await sendToGallabox(customerPhone, resumeMsg, channelID);
        return res.status(200).json({ success: true, reason: 'bot_resumed_by_agent' });
      }

      // 4. Real human executive manual message (anything other than template, echo, #bot on)
      const ctxForAgent = await getCustomerContext(customerPhone);
      pauseBot(customerPhone);
      if (ctxForAgent.botState !== 'PAUSED') {
        console.log(`[Webhook] Real agent manual message received for ${customerPhone}. Pausing bot.`);
        await updateCustomerInfo(customerPhone, { botState: 'PAUSED', agentReplied: true });
      } else {
        console.log(`[Webhook] Real agent manual message received for ${customerPhone}. Setting agentReplied = true.`);
        await updateCustomerInfo(customerPhone, { agentReplied: true });
      }
      return res.status(200).json({ success: true, reason: 'outbound_agent_message' });
    }

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

    // Track last interaction time (used by drip cron to skip active users)
    if (customerPhone) touchInteraction(customerPhone).catch(() => {});

    const lowerMsg = userMessage.toLowerCase().trim();

    // Fetch state from MongoDB early
    const customerName = body?.contact?.name || 'Unknown';
    const t0Context = Date.now();
    const customerContext = await getCustomerContext(customerPhone, customerName);
    const tContext = Date.now() - t0Context;
    let currentState = customerContext.botState;

    if (currentState === 'PAUSED') {
      const isMoreOrBuy = lowerMsg === 'more' || lowerMsg.startsWith('buy');
      
      // If agent has already replied, bot MUST stay completely silent
      if (!isMoreOrBuy || customerContext.agentReplied) {
        console.log(`[Webhook] Bot is PAUSED for ${customerPhone} (Agent replied: ${!!customerContext.agentReplied}). Skipping.`);
        return res.status(200).json({ success: true, reason: 'bot_paused' });
      } else {
        console.log(`[Webhook] Customer used '${lowerMsg}' while PAUSED (Agent not replied yet). Allowing request.`);
      }
    }

    // ── Global Commands ───────────────────────────────────────────────────
    const agentRegex = /\b(talk\s*to\s*(?:an?\s*)?(?:agent|human|executive)|connect\s*(?:to|me)?\s*(?:an?\s*)?(?:agent|human|executive)|agent\s*se\s*baat|executive\s*se\s*baat|customer\s*care|call\s*me|call\s*back)\b|^(agent|human|executive|help|madad|सहायता)$/i;
    const resetRegex = /^(menu|restart|reset|clear|start|शुरू|वापस)\b/i;
    const languageRegex = /^(language|change language|bhasha|bhasa|select language|ભાષા|भाषा)\b/i;

    if (agentRegex.test(lowerMsg)) {
      pauseBot(customerPhone);
      await updateCustomerInfo(customerPhone, { botState: 'PAUSED', agentReplied: false });

      // Save conversationId so agentTimeout can unassign later
      if (body?.conversationId) {
        saveConversationId(customerPhone, body.conversationId).catch(() => {});
      }

      // 1. Tag in Gallabox → triggers 3-min Workflow timer
      await addGallaboxTag(customerPhone, "REQUIRE_AGENT");

      // 2. Notify Admin Panel in background → triggers round-robin assignment
      const ADMIN_API = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
      const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET || '';
      fetch(`${ADMIN_API}/api/v1/gallabox-bot/request-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': ADMIN_SECRET },
        body: JSON.stringify({
          phone: customerPhone,
          name: customerContext.name || '',
          pincode: customerContext.pinCode || '',
          pinCode: customerContext.pinCode || '',
          language: customerContext.language || 'English',
          activeFilters: customerContext.activeFilters || {},
          conversationId: body?.conversationId || ''
        })
      }).then(r => console.log(`[Webhook] Admin notified for agent request: ${r.status}`))
        .catch(e => console.error(`[Webhook] Admin notification failed:`, e.message));

      // 3. VPS Timeout Logic: Auto-reply if agent doesn't respond in 2 minutes
      setTimeout(async () => {
        try {
          const ctx = await getCustomerContext(customerPhone);
          if (!ctx.agentReplied) {
            console.log(`[Webhook] Agent timeout (2 min) for ${customerPhone}. Reactivating bot (keeping assigned in Gallabox).`);
            // CRITICAL: DO NOT UNASSIGN in Gallabox! Prevents infinite 2-min loop & keeps executive ownership.
            resumeBot(customerPhone);
            await updateCustomerInfo(customerPhone, { botState: 'ACTIVE', agentReplied: false });
            
            const lang = ctx.language || 'English';
            let timeoutMsg = '';
            
            if (lang === 'English') {
              timeoutMsg = `Our executives are currently busy assisting other clients. 👨‍💻\n\nThey will connect with you here shortly! In the meantime, you can chat with me if you have any questions, want to search VIP numbers, or need any help. 😊`;
            } else if (lang === 'Hindi') {
              timeoutMsg = `हमारे सभी executives अभी व्यस्त हैं। 👨‍💻\n\nवो आपसे जल्द ही यहाँ connect करेंगे! तब तक अगर आपकी कोई query हो या कोई VIP नंबर देखना हो, तो आप मुझसे बात कर सकते हैं। 😊`;
            } else if (lang === 'Gujarati') {
              timeoutMsg = `અમારા તમામ એક્ઝિક્યુટિવ્સ અત્યારે વ્યસ્ત છે. 👨‍💻\n\nતેઓ ટૂંક સમયમાં અહીં તમારી સાથે જોડાશે! ત્યાં સુધી જો તમને કોઈ પ્રશ્ન હોય અથવા કોઈ VIP નંબર જોવો હોય, તો તમે મારી સાથે વાત કરી શકો છો. 😊`;
            } else if (lang === 'Marathi') {
              timeoutMsg = `आमचे सर्व एक्झिक्युटिव्ह सध्या व्यस्त आहेत. 👨‍💻\n\nते लवकरच तुमच्याशी येथे कनेक्ट होतील! तोपर्यंत जर तुमची काही शंका असेल किंवा कोणताही VIP नंबर शोधायचा असेल, तर तुम्ही माझ्याशी बोलू शकता. 😊`;
            } else {
              timeoutMsg = `Hamare sabhi executives abhi busy hain. 👨‍💻\n\nWoh aapse jald hi yaha connect karenge! Tab tak agar aapko koi query ho ya koi VIP number dekhna ho, toh aap mujhse baat kar sakte hain. 😊`;
            }
            await sendToGallabox(customerPhone, timeoutMsg, channelID);
          }
        } catch (err) {
          console.error('[Webhook] VPS timeout error:', err.message);
        }
      }, 2 * 60 * 1000);

      const lang = customerContext.language || 'English';
      let errReply = "Your request has been sent to our executive. They'll connect within 2 minutes. 👨‍💻\n\nIn the meantime, feel free to ask me anything or search numbers!";
      
      if (lang === 'English') {
        errReply = "Your request has been sent to our executive. They'll connect within 2 minutes. 👨‍💻\n\nIn the meantime, feel free to ask me anything or search numbers!";
      } else if (lang === 'Hindi') {
        errReply = "आपकी request हमारे executive को भेज दी गई है। वो 2 मिनट में connect होंगे। 👨‍💻\n\nतब तक आप मुझसे कुछ भी पूछ सकते हैं या नंबर सर्च कर सकते हैं!";
      } else if (lang === 'Gujarati') {
        errReply = "તમારી request અમારા executive ને મોકલી દેવામાં આવી છે. તેઓ 2 મિનિટમાં connect થશે. 👨‍💻\n\nત્યાં સુધી તમે મને કંઈપણ પૂછી શકો છો અથવા નંબર શોધી શકો છો!";
      } else if (lang === 'Marathi') {
        errReply = "तुमची request आमच्या executive ला पाठवली आहे. ते 2 मिनिटांत connect होतील. 👨‍💻\n\nतोपर्यंत तुम्ही मला काहीही विचारू शकता किंवा नंबर शोधू शकता!";
      } else {
        errReply = "Aapki request hamare executive ko bhej di gayi hai. Woh 2 minute mein connect honge. 👨‍💻\n\nTab tak aap mujhse kuch bhi pooch sakte hain ya numbers search kar sakte hain!";
      }

      await sendToGallabox(customerPhone, errReply, channelID);
      return res.status(200).json({ success: true, reason: 'agent_requested' });
    }

    if (resetRegex.test(lowerMsg) && currentState === 'ACTIVE') {
      await resetActiveFilters(customerPhone);
      const errReply = "✅ Aapka pichla search reset kar diya gaya hai.\n\nAap naya number kaisa chahte hain? (e.g., 'need mirror numbers')";
      await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
    }

    if (currentState === 'NEW') {
      // 1. Check if chat is already assigned in CRM
      try {
        const ADMIN_API = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
        const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET || '';
        const t0Check = Date.now();
        const checkRes = await fetch(`${ADMIN_API}/api/v1/gallabox-bot/check-assigned?phone=${customerPhone}`, {
            headers: { 'x-bot-secret': ADMIN_SECRET },
            signal: AbortSignal.timeout(2000)
        });
        const checkData = await checkRes.json();
        console.log(`[Webhook] CRM check-assigned took ${Date.now() - t0Check}ms`);
        
        if (checkData?.isAssigned) {
            console.log(`[Webhook] Chat ${customerPhone} is ALREADY assigned to ${checkData.assignedTo}. Pausing bot silently.`);
            await updateCustomerInfo(customerPhone, { botState: 'PAUSED', agentReplied: false });
            return res.status(200).json({ success: true, reason: 'already_assigned' });
        }
      } catch (err) {
        console.error(`[Webhook] Error checking if lead is assigned:`, err.message);
      }
    }

    // ── Global Language Command (For changing language anytime) ──
    if (languageRegex.test(lowerMsg.trim())) {
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_LANGUAGE', language: null });
      const langReply = "👋 Hello! How can I help you? / नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nPlease select your preferred language / कृपया अपनी भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. ગુજરાતી (Gujarati)\n4. मराठी (Marathi)\n5. Hinglish\n\n_Reply with 1, 2, 3, 4, or 5_";
      await sendToGallabox(customerPhone, langReply, channelID);
      return res.status(200).json({ success: true, reason: 'language_menu_sent' });
    }

    // ── State Machine: Onboarding (Language -> Name & Pincode -> Active Sales Flow) ──
    if (currentState === 'NEW') {
      // Check if user already provided Name and 6-digit Pincode in first message
      const pinMatch = userMessage.match(/\b\d{6}\b/);
      const extractedName = userMessage.replace(/\b\d{6}\b/, '').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

      if (pinMatch && extractedName.length >= 2) {
        const extractedPin = pinMatch[0];
        const detectedLang = detectLanguage(userMessage);
        await updateCustomerInfo(customerPhone, { 
          botState: 'ACTIVE', 
          language: detectedLang,
          pinCode: extractedPin, 
          name: extractedName 
        });
        customerContext.pinCode = extractedPin;
        customerContext.name = extractedName;
        customerContext.language = detectedLang;
        customerContext.botState = 'ACTIVE';

        // Background sync to CRM
        const ADMIN_API = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
        const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET || '';
        fetch(`${ADMIN_API}/api/v1/gallabox-bot/sync-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bot-secret': ADMIN_SECRET },
          body: JSON.stringify({
            phone: customerPhone,
            name: extractedName,
            pincode: extractedPin,
            pinCode: extractedPin,
            location: extractedPin,
            language: detectedLang
          })
        }).catch(e => console.error(`[Webhook] Failed to sync lead to CRM:`, e.message));

        const welcomeMsg = `Awesome, ${extractedName}! 🎉 Aapka Pincode ${extractedPin} save ho gaya hai.\n\nMain Aman, Numberwale se aapka VIP Number Consultant. Aap kaisa VIP mobile number dekhna chahte hain? (e.g. _req 9999_, _mirror numbers_, ya apna budget batayein) 😊`;
        await sendToGallabox(customerPhone, welcomeMsg, channelID);
        return res.status(200).json({ success: true, reason: 'onboarded_direct' });
      }

      // If no name + pincode, prompt Language selection
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_LANGUAGE' });
      const langReply = "👋 Hello! How can I help you? / नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nPlease select your preferred language / कृपया अपनी भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. ગુજરાતી (Gujarati)\n4. मराठी (Marathi)\n5. Hinglish\n\n_Reply with 1, 2, 3, 4, or 5_";
      await sendToGallabox(customerPhone, langReply, channelID);
      return res.status(200).json({ success: true, reason: 'awaiting_language' });
    }

    if (currentState === 'AWAITING_LANGUAGE') {
      const selected = userMessage.trim().toLowerCase();
      let chosenLanguage = null;
      if (selected === '1' || selected === 'english') chosenLanguage = 'English';
      else if (selected === '2' || selected === 'hindi' || selected === 'हिंदी') chosenLanguage = 'Hindi';
      else if (selected === '3' || selected === 'gujarati' || selected === 'ગુજરાતી') chosenLanguage = 'Gujarati';
      else if (selected === '4' || selected === 'marathi' || selected === 'मराठी') chosenLanguage = 'Marathi';
      else if (selected === '5' || selected === 'hinglish') chosenLanguage = 'Hinglish';

      if (!chosenLanguage) {
        const errorReply = "❌ Invalid selection. Please reply with 1, 2, 3, 4, or 5.\nगलत चुनाव। कृपया 1, 2, 3, 4, या 5 रिप्लाई करें।";
        await sendToGallabox(customerPhone, errorReply, channelID);
        return res.status(200).json({ success: true, reason: 'invalid_language' });
      }

      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_INFO', language: chosenLanguage });
      customerContext.language = chosenLanguage;
      customerContext.botState = 'AWAITING_INFO';

      let welcomeReply = "";
      if (chosenLanguage === 'English') {
        welcomeReply = "Welcome to Numberwale! 🎉\n\nI am Aman, your VIP Number Consultant.\n\nTo check the best available VIP numbers and telecom circle availability for your area, please type your *Name* and *6-digit Pincode*.\n\nExample: _Rahul 400001_";
      } else if (chosenLanguage === 'Hindi') {
        welcomeReply = "नंबरवाले में आपका स्वागत है! 🎉\n\nमैं अमन, आपका VIP नंबर कंसल्टेंट।\n\nआपके एरिया में बेस्ट VIP मोबाइल नंबर और टेलीकॉम सर्कल उपलब्धता चेक करने के लिए, कृपया अपना *नाम* और *6-अंकों का पिनकोड* लिखकर भेजें।\n\nउदाहरण: _Rahul 400001_";
      } else if (chosenLanguage === 'Gujarati') {
        welcomeReply = "નંબરવાલેમાં તમારું સ્વાગત છે! 🎉\n\nહું અમન, તમારો VIP નંબર કન્સલ્ટન્ટ.\n\nતમારા વિસ્તારમાં શ્રેષ્ઠ VIP મોબાઈલ નંબર અને ટેલિકોમ સર્કલ ઉપલબ્ધતા ચકાસવા માટે, કૃપા કરીને તમારું *નામ* અને *6-આંકડાનો પિનકોડ* લખીને મોકલો.\n\nઉદાહરણ: _Rahul 400001_";
      } else if (chosenLanguage === 'Marathi') {
        welcomeReply = "नंबरवाले मध्ये आपले स्वागत आहे! 🎉\n\nमी अमन, तुमचा VIP नंबर सल्लागार.\n\nतुमच्या भागात सर्वोत्तम VIP मोबाईल नंबर आणि टेलिकॉम सर्कल उपलब्धता तपासण्यासाठी, कृपया तुमचे *नाव* आणि *६-अंकी पिनकोड* लिहून पाठवा.\n\nउदाहरण: _Rahul 400001_";
      } else {
        welcomeReply = "Welcome to Numberwale! 🎉\n\nMain Aman, aapka VIP Number Consultant.\n\nAapke telecom circle me best available VIP numbers aur delivery check karne ke liye, kripya apna *Naam* aur *6-digit Pincode* type karke bhejein.\n\nExample: _Rahul 400001_";
      }

      await sendToGallabox(customerPhone, welcomeReply, channelID);
      return res.status(200).json({ success: true, reason: 'awaiting_info' });
    }

    if (currentState === 'AWAITING_INFO') {
      const pinMatch = userMessage.match(/\b\d{6}\b/);
      let extractedName = userMessage.replace(/\b\d{6}\b/, '').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

      if (pinMatch && extractedName.length >= 2) {
        const extractedPin = pinMatch[0];
        await updateCustomerInfo(customerPhone, { 
          botState: 'ACTIVE', 
          pinCode: extractedPin, 
          name: extractedName 
        });
        customerContext.pinCode = extractedPin;
        customerContext.name = extractedName;
        customerContext.botState = 'ACTIVE';

        // Background sync to CRM
        const ADMIN_API = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
        const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET || '';
        fetch(`${ADMIN_API}/api/v1/gallabox-bot/sync-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bot-secret': ADMIN_SECRET },
          body: JSON.stringify({
            phone: customerPhone,
            name: extractedName,
            pincode: extractedPin,
            pinCode: extractedPin,
            location: extractedPin,
            language: customerContext.language || 'Hinglish'
          })
        }).catch(e => console.error(`[Webhook] Failed to sync lead to CRM:`, e.message));

        const lang = customerContext.language || 'Hinglish';
        let instructions = `Awesome, ${extractedName}! 🎉 Aapka Pincode ${extractedPin} save ho gaya hai.\n\nAap kaisa VIP mobile number dekhna chahte hain? Aap mujhe bata sakte hain:\n\n` +
          `👑 _"9999 ending numbers"_\n` +
          `👑 _"Mirror / Symmetry numbers"_\n` +
          `👑 _"Sum total 5 ya 6 lucky number"_\n` +
          `👑 _"Budget under 25000"_\n\n` +
          `Type kijiye aur main turant numbers nikalta hun! 😊`;

        if (lang === 'English') {
          instructions = `Awesome, ${extractedName}! 🎉 Your Pincode ${extractedPin} has been saved.\n\nWhat kind of VIP mobile number are you looking for? You can tell me:\n\n` +
            `👑 _"9999 ending numbers"_\n` +
            `👑 _"Mirror / Symmetry numbers"_\n` +
            `👑 _"Sum total 5 or 6 lucky number"_\n` +
            `👑 _"Budget under 25000"_\n\n` +
            `Type your query and I will fetch the numbers! 😊`;
        } else if (lang === 'Hindi') {
          instructions = `बढ़िया, ${extractedName}! 🎉 आपका पिनकोड ${extractedPin} सेव हो गया है।\n\nआप कैसा VIP मोबाइल नंबर ढूंढ रहे हैं? आप मुझे बता सकते हैं:\n\n` +
            `👑 _"9999 ending numbers"_\n` +
            `👑 _"Mirror / Symmetry numbers"_\n` +
            `👑 _"Sum total 5 या 6 lucky number"_\n` +
            `👑 _"Budget under 25000"_\n\n` +
            `टाइप कीजिए और हम आपके लिए नंबर्स खोजेंगे! 😊`;
        } else if (lang === 'Gujarati') {
          instructions = `સરસ, ${extractedName}! 🎉 તમારો પિનકોડ ${extractedPin} સેવ થઈ ગયો છે.\n\nતમે કેવો VIP મોબાઈલ નંબર શોધી રહ્યા છો? તમે મને કહી શકો છો:\n\n` +
            `👑 _"9999 ending numbers"_\n` +
            `👑 _"Mirror / Symmetry numbers"_\n` +
            `👑 _"Sum total 5 અથવા 6 lucky number"_\n` +
            `👑 _"Budget under 25000"_\n\n` +
            `ટાઈપ કરો અને અમે તમારા માટે નંબર્સ શોધીશું! 😊`;
        } else if (lang === 'Marathi') {
          instructions = `उत्तम, ${extractedName}! 🎉 तुमचा पिनकोड ${extractedPin} सेव्ह झाला आहे.\n\nतुम्ही कसा VIP मोबाईल नंबर शोधत आहात? तुम्ही मला सांगू शकता:\n\n` +
            `👑 _"9999 ending numbers"_\n` +
            `👑 _"Mirror / Symmetry numbers"_\n` +
            `👑 _"Sum total 5 किंवा 6 lucky number"_\n` +
            `👑 _"Budget under 25000"_\n\n` +
            `टाईप करा आणि आम्ही तुमच्यासाठी नंबर शोधू! 😊`;
        }

        await sendToGallabox(customerPhone, instructions, channelID);
        return res.status(200).json({ success: true, reason: 'onboarding_complete' });
      } else {
        const lang = customerContext.language || 'Hinglish';
        let errReply = "Aapke telecom circle me best available VIP numbers aur delivery check karne ke liye, kripya apna *Naam* aur *6-digit Pincode* ek sath bhejein. 😊\n\nExample: _Rahul 400001_";

        if (lang === 'English') {
          errReply = "To check the best available VIP numbers and telecom circle availability, please provide your *Name* and *6-digit Pincode* together. 😊\n\nExample: _Rahul 400001_";
        } else if (lang === 'Hindi') {
          errReply = "आपके टेलीकॉम सर्कल में उपलब्ध बेस्ट VIP नंबर और डिलीवरी चेक करने के लिए, कृपया अपना *नाम* और *6-अंकों का पिनकोड* एक साथ लिखकर भेजें। 😊\n\nउदाहरण: _Rahul 400001_";
        } else if (lang === 'Gujarati') {
          errReply = "તમારા ટેલિકોમ સર્કલમાં શ્રેષ્ઠ VIP નંબર અને ડિલિવરી ચકાસવા માટે, કૃપા કરીને તમારું *નામ* અને *6-આંકડાનો પિનકોડ* એકસાથે લખીને મોકલો. 😊\n\nઉદાહરણ: _Rahul 400001_";
        } else if (lang === 'Marathi') {
          errReply = "तुमच्या टेलिकॉम सर्कलमध्ये उपलब्ध असलेले सर्वोत्तम VIP नंबर आणि डिलिव्हरी तपासण्यासाठी, कृपया तुमचे *नाव* आणि *६-अंकी पिनकोड* एकत्र लिहून पाठवा. 😊\n\nउदाहरण: _Rahul 400001_";
        }

        await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true, reason: 'invalid_info_format' });
      }
    }

    // Ensure language is set for ACTIVE users
    if (!customerContext.language) {
      customerContext.language = detectLanguage(userMessage);
      updateCustomerInfo(customerPhone, { language: customerContext.language }).catch(() => {});
    }

    // If state is ACTIVE, proceed normally
    let jsonQuery;
    let page = 1;
    let parsedTokens = 0;
    let parsedModel = null;
    let tAi = 0;

    // ── "Show More" handling ──────────────────────────────────────────────
    if (isShowMoreIntent(userMessage)) {
      const activeFilters = customerContext.activeFilters;
      if (!activeFilters || Object.keys(activeFilters).length === 0) {
        const lang = customerContext.language || 'English';
        let replyText = "Please make a search first, then type *'show more'*! 😊\nExample: _req 99 two times_";
        
        if (lang === 'English') {
           replyText = "Please make a search first, then type *'show more'*! 😊\nExample: _req 99 two times_";
        } else if (lang === 'Hindi') {
           replyText = "पहले कोई खोज करें, फिर *'show more'* लिखें! 😊\nउदाहरण: _req 99 two times_";
        } else if (lang === 'Gujarati') {
           replyText = "પહેલા કોઈ શોધ કરો, પછી *'show more'* લખો! 😊\nઉદાહરણ: _req 99 two times_";
        } else if (lang === 'Marathi') {
           replyText = "आधी काही शोध करा, मग *'show more'* लिहा! 😊\nउदाहरण: _req 99 two times_";
        }
        
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
        const lang = customerContext.language || 'English';

        if (!product || !product.price) {
          let errMsg = `❌ *${buyNumber}* nahi mila ya already sold out ho gaya hai.\n\nDobara search karo: _req ${buyNumber.slice(-4)}_`;
          if (lang === 'English') {
            errMsg = `❌ *${buyNumber}* was not found or is already sold out.\n\nPlease search again: _req ${buyNumber.slice(-4)}_`;
          } else if (lang === 'Hindi') {
            errMsg = `❌ *${buyNumber}* नहीं मिला या पहले ही बिक चुका है।\n\nकृपया दोबारा खोजें: _req ${buyNumber.slice(-4)}_`;
          } else if (lang === 'Gujarati') {
            errMsg = `❌ *${buyNumber}* મળ્યો નથી અથવા પહેલેથી જ વેચાઈ ગયો છે.\n\nકૃપા કરીને ફરીથી શોધો: _req ${buyNumber.slice(-4)}_`;
          } else if (lang === 'Marathi') {
            errMsg = `❌ *${buyNumber}* आढळला नाही किंवा आधीच विकला गेला आहे.\n\nकृपया पुन्हा शोधा: _req ${buyNumber.slice(-4)}_`;
          }
          await sendToGallabox(customerPhone, errMsg, channelID);
          return res.status(200).json({ success: true });
        }

        // Calculate GST and Total Amount (product.price is the subtotal)
        const subtotal = product.price;
        const gstPercentage = 18; // Fixed 18% GST as per backend
        const gstAmount = Math.round(subtotal * (gstPercentage / 100));
        const totalAmount = subtotal + gstAmount;

        // Hardcoded to always redirect to main website
        const checkoutLink = `https://numberwale.com/cart-add/${buyNumber}`;

        let labelBreakdown = 'Price Breakdown';
        let labelBase = 'Base Price';
        let labelDiscount = 'Discount';
        let labelSubtotal = 'Subtotal';
        let labelGst = 'GST (18%)';
        let labelTotal = 'Total Amount';

        if (lang === 'Hindi') {
          labelBreakdown = 'कीमत का विवरण';
          labelBase = 'मूल कीमत (Base Price)';
          labelDiscount = 'छूट (Discount)';
          labelSubtotal = 'उप-योग (Subtotal)';
          labelGst = 'जीएसटी / GST (18%)';
          labelTotal = 'कुल राशि (Total Amount)';
        } else if (lang === 'Gujarati') {
          labelBreakdown = 'કિંમતનું વિગતવાર પત્રક';
          labelBase = 'મૂળ કિંમત (Base Price)';
          labelDiscount = 'ડિસ્કાઉન્ટ (Discount)';
          labelSubtotal = 'પેટા સરવાળો (Subtotal)';
          labelGst = 'જીએસટી / GST (18%)';
          labelTotal = 'કુલ રકમ (Total Amount)';
        } else if (lang === 'Marathi') {
          labelBreakdown = 'किंमतीचा तपशील';
          labelBase = 'मूळ किंमत (Base Price)';
          labelDiscount = 'सूट (Discount)';
          labelSubtotal = 'उप-एकूण (Subtotal)';
          labelGst = 'जीएसटी / GST (18%)';
          labelTotal = 'एकूण रक्कम (Total Amount)';
        }

        let priceBreakdown = ``;
        const effDiscount = product.myDiscount !== 0 && product.myDiscount ? product.myDiscount : product.vendorDiscount;
        
        if (effDiscount && product.basePrice) {
          const discountAmt = Math.round(product.basePrice * (effDiscount / 100));
          priceBreakdown += `*${labelBreakdown}:*\n` +
            `💰 ${labelBase}: ₹${product.basePrice.toLocaleString('en-IN')}\n` +
            `🏷️ ${labelDiscount}: ${effDiscount}% (-₹${discountAmt.toLocaleString('en-IN')})\n` +
            `🧾 ${labelSubtotal}: ₹${subtotal.toLocaleString('en-IN')}\n` +
            `🏛️ ${labelGst}: ₹${gstAmount.toLocaleString('en-IN')}\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ *${labelTotal}: ₹${totalAmount.toLocaleString('en-IN')}*\n\n`;
        } else {
          priceBreakdown += `*${labelBreakdown}:*\n` +
            `🧾 ${labelSubtotal}: ₹${subtotal.toLocaleString('en-IN')}\n` +
            `🏛️ ${labelGst}: ₹${gstAmount.toLocaleString('en-IN')}\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ *${labelTotal}: ₹${totalAmount.toLocaleString('en-IN')}*\n\n`;
        }

        const custName = customerContext.name && customerContext.name !== 'Unknown' ? `${customerContext.name} ji` : '';
        let caption = '';
        if (lang === 'Hindi') {
          caption = `🎉 *शानदार चुनाव ${custName}!* यह VIP नंबर आपकी व्यक्तिगत और व्यापारिक पहचान को नई ऊँचाइयों पर ले जाएगा। ✨\n\n` +
            `📱 नंबर: *${buyNumber}*\n\n` +
            priceBreakdown +
            `🛡️ *नंबरवाले का वादा:*\n` +
            `1️⃣ 100% कानूनी MNP प्रक्रिया (TRAI अनुमोदित)\n` +
            `2️⃣ 24 घंटे में WhatsApp पर UPC कोड और पक्का GST बिल\n` +
            `3️⃣ किसी भी नजदीकी ऑपरेटर स्टोर (Jio/Airtel/Vi/BSNL) पर आधार से बायोमेट्रिक e-KYC\n` +
            `4️⃣ 100% Money-Back Guarantee!\n\n` +
            `🔒 *सुरक्षित ऑनलाइन भुगतान करने के लिए यहाँ क्लिक करें:*\n` +
            `${checkoutLink}\n\n` +
            `भुगतान के तुरंत बाद हमारी टीम आपसे संपर्क करेगी! 😊`;
        } else if (lang === 'Gujarati') {
          caption = `🎉 *શ્રેષ્ઠ પસંદગી ${custName}!* આ VIP નંબર તમારા બિઝનેસ અને પર્સનાલિટીને નવી ઓળખ આપશે. ✨\n\n` +
            `📱 નંબર: *${buyNumber}*\n\n` +
            priceBreakdown +
            `🛡️ *નંબરવાલે ગેરંટી:*\n` +
            `1️⃣ 100% કાનૂની MNP પ્રક્રિયા\n` +
            `2️⃣ 24 કલાકમાં WhatsApp પર UPC કોડ અને GST બિલ\n` +
            `3️⃣ કોઈપણ નજીકના સ્ટોર પર આધાર દ્વારા e-KYC\n` +
            `4️⃣ 100% Money-Back Guarantee!\n\n` +
            `🔒 *સુરક્ષિત પેમેન્ટ કરવા માટે અહીં ક્લિક કરો:*\n` +
            `${checkoutLink}\n\n` +
            `કોઈપણ પ્રશ્ન હોય તો જણાવો! 😊`;
        } else if (lang === 'Marathi') {
          caption = `🎉 *उत्कृष्ट निवड ${custName}!* हा VIP नंबर तुमच्या व्यवसायाला आणि व्यक्तिमत्त्वाला नवी प्रतिष्ठा मिळवून देईल. ✨\n\n` +
            `📱 नंबर: *${buyNumber}*\n\n` +
            priceBreakdown +
            `🛡️ *नंबरवाले ची खात्री:*\n` +
            `1️⃣ 100% कायदेशीर MNP प्रक्रिया\n` +
            `2️⃣ 24 तासांत WhatsApp वर UPC कोड आणि GST बिल\n` +
            `3️⃣ कोणत्याही जवळच्या ऑपरेटर स्टोअरमध्ये आधारने e-KYC\n` +
            `4️⃣ 100% Money-Back Guarantee!\n\n` +
            `🔒 *सुरक्षित पेमेंट करण्यासाठी खालील लिंकवर क्लिक करा:*\n` +
            `${checkoutLink}\n\n` +
            `पेमेंटनंतर लगेच प्रक्रिया सुरू होईल! 😊`;
        } else if (lang === 'English') {
          caption = `🎉 *Congratulations ${custName}! Excellent Choice!* This VIP number will elevate your personal and professional identity. ✨\n\n` +
            `📱 Number: *${buyNumber}*\n\n` +
            priceBreakdown +
            `🛡️ *The Numberwale Assurance:*\n` +
            `1️⃣ 100% Legal MNP process compliant with TRAI regulations\n` +
            `2️⃣ Digital delivery of Unique Porting Code (UPC) & GST invoice within 24 hours\n` +
            `3️⃣ Biometric e-KYC with Aadhar at any local Jio, Airtel, Vi, or BSNL store\n` +
            `4️⃣ 100% Money-Back Guarantee if porting fails\n\n` +
            `🔒 *Click below to complete secure payment:*\n` +
            `${checkoutLink}\n\n` +
            `Our support executive will guide you right after booking! 😊`;
        } else {
          // Hinglish
          caption = `🎉 *Congratulations ${custName}! Zabardast Choice!* Yeh VIP number aapki personal aur business identity dono ko royal bana dega. ✨\n\n` +
            `📱 Number: *${buyNumber}*\n\n` +
            priceBreakdown +
            `🛡️ *Numberwale Promise:*\n` +
            `1️⃣ 100% Legal MNP process (TRAI approved)\n` +
            `2️⃣ 24 hours ke andar WhatsApp par Unique Porting Code (UPC) + Official GST invoice\n` +
            `3️⃣ Nearest Jio/Airtel/Vi/BSNL store jakar Aadhar se biometric e-KYC\n` +
            `4️⃣ 100% Money-Back Guarantee!\n\n` +
            `🔒 *Secure online payment karne ke liye neeche click karein:*\n` +
            `${checkoutLink}\n\n` +
            `Payment complete hone ke baad hamari team aapse turant connect karegi! 😊`;
        }

        await sendToGallabox(customerPhone, caption, channelID);

        // User is buying → stop cart drip campaign
        stopDrip(customerPhone).catch(() => {});

        console.log(`[Webhook] Buy reply sent for ${buyNumber}`);
      } catch (buyErr) {
        console.error('[Webhook] Buy intent error:', buyErr.message);
        const lang = customerContext.language || 'English';
        let errMsg = `❌ Payment link generate nahi hua. Thodi der baad try karo.`;
        if (lang === 'English') {
          errMsg = `❌ Could not generate payment link. Please try again in a while.`;
        } else if (lang === 'Hindi') {
          errMsg = `❌ पेमेंट लिंक जनरेट नहीं हो सका। कृपया कुछ समय बाद दोबारा प्रयास करें।`;
        } else if (lang === 'Gujarati') {
          errMsg = `❌ પેમેન્ટ લિંક જનરેટ થઈ શકી નથી. કૃપા કરીને થોડીવાર પછી ફરી પ્રયાસ કરો.`;
        } else if (lang === 'Marathi') {
          errMsg = `❌ पेमेंट लिंक जनरेट होऊ शकली नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.`;
        }
        await sendToGallabox(customerPhone, errMsg, channelID);
        return res.status(200).json({ success: true });
      }
      return res.status(200).json({ success: true });

    // ── Fresh search, Greeting, or Consultation (AI Sales Agent) ──────────
    } else {
      // ── AI Sales Agent: Intent Analysis (Greeting / FAQ / Consultation / Numerology) ──
      const customerIntent = detectCustomerIntent(userMessage);

      // 0. Greeting / Small Talk Intent
      if (customerIntent.type === 'GREETING') {
        const hasFilters = customerContext.activeFilters && Object.keys(customerContext.activeFilters).length > 0;
        let greetReply = '';
        if (hasFilters) {
          const lang = customerContext.language || 'Hinglish';
          if (lang === 'Hindi') {
            greetReply = `😊 कोई बात नहीं! क्या आप अपनी पिछली खोज जारी रखना चाहते हैं या नई खोज करना चाहते हैं?\n\n👉 अगले पेज के लिए *"more"* रिप्लाई करें\n👉 नई खोज के लिए *"reset"* रिप्लाई करें\n👉 बात करने के लिए *"agent"* रिप्लाई करें`;
          } else if (lang === 'Gujarati') {
            greetReply = `😊 કોઈ વાંધો નહિ! શું તમે તમારી અગાઉની શોધ ચાલુ રાખવા માંગો છો કે નવી શોધ કરવા માંગો છો?\n\n👉 આગળના પેજ માટે *"more"* રિપ્લાય કરો\n👉 નવી શોધ માટે *"reset"* રિપ્લાય કરો\n👉 વાત કરવા *"agent"* રિપ્લાય કરો`;
          } else if (lang === 'Marathi') {
            greetReply = `😊 काही हरकत नाही! तुम्हाला तुमची मागील शोध चालू ठेवायची आहे की नवीन शोध करायची आहे?\n\n👉 पुढच्या पेजसाठी *"more"* रिप्लाय करा\n👉 नवीन शोधसाठी *"reset"* रिप्लाय करा\n👉 बोलण्यासाठी *"agent"* रिप्लाय करा`;
          } else if (lang === 'English') {
            greetReply = `😊 No problem! Would you like to continue your previous search or explore new numbers?\n\n👉 Reply *"more"* for next page\n👉 Reply *"reset"* for fresh search\n👉 Reply *"agent"* to speak with our manager`;
          } else {
            greetReply = `😊 Koi baat nahi! Kya aap apni pichli search continue karna chahte hain ya naya number dekhna hai?\n\n👉 Reply *"more"* for next page\n👉 Reply *"reset"* for new search\n👉 Reply *"agent"* to connect with manager`;
          }
        } else {
          greetReply = await generateSalesAgentResponse({
            userMessage,
            customerContext,
            history: customerContext.history || [],
            intent: { type: 'GREETING' }
          });
        }
        await sendToGallabox(customerPhone, greetReply, channelID);
        await logInteraction({
          phone: customerPhone,
          name: customerName,
          userText: userMessage,
          botText: greetReply,
          isFail: false,
          model: 'agent-greeting',
          tokensUsed: 0,
          jsonQuery: null,
          page: 1
        }).catch(() => {});
        return res.status(200).json({ success: true, reason: 'greeting_replied' });
      }

      // 1. FAQ & Process Questions (Porting, SIM, MNP, Timeline, Pricing, Trust)
      if (customerIntent.type.startsWith('FAQ_')) {
        const t0Faq = Date.now();
        const faqReply = await generateFaqReply({
          intentType: customerIntent.type,
          userMessage,
          customerContext
        });
        const tFaq = Date.now() - t0Faq;
        const t0Send = Date.now();
        await sendToGallabox(customerPhone, faqReply, channelID);
        const tSend = Date.now() - t0Send;
        console.log(`⚡ [PERF] FAQ served in ${Date.now() - reqStartTime}ms (DB: ${tContext}ms | AI/FAQ: ${tFaq}ms | Gallabox: ${tSend}ms)`);
        await logInteraction({
          phone: customerPhone,
          name: customerName,
          userText: userMessage,
          botText: faqReply,
          isFail: false,
          model: 'agent-faq',
          tokensUsed: 0,
          jsonQuery: null,
          page: 1
        }).catch(() => {});
        return res.status(200).json({ success: true, reason: 'faq_replied' });
      }

      // 2. Numerology & Astrology Consultation
      if (customerIntent.type === 'NUMEROLOGY') {
        const t0Num = Date.now();
        if (!customerIntent.data) {
          const askDobReply = await generateNumerologyReply({
            numerologyData: null,
            customerContext
          });
          const t0Send = Date.now();
          await sendToGallabox(customerPhone, askDobReply, channelID);
          const tSend = Date.now() - t0Send;
          console.log(`⚡ [PERF] Numerology DOB prompt served in ${Date.now() - reqStartTime}ms (DB: ${tContext}ms | Gallabox: ${tSend}ms)`);
          return res.status(200).json({ success: true, reason: 'numerology_dob_requested' });
        }

        const numAnalysis = await generateNumerologyReply({
          numerologyData: customerIntent.data,
          customerContext
        });

        // Search for numbers matching user's recommended scoreSum (Mulank)
        const luckyScoreSum = customerIntent.data.recommendedScoreSum;
        const t0Search = Date.now();
        const numResult = await fetchNumbers({ scoreSum: luckyScoreSum }, 1);
        const tSearch = Date.now() - t0Search;

        let finalReply = numAnalysis;
        if (numResult.products && numResult.products.length > 0) {
          const numbersDisplay = await generateSalesAgentResponse({
            userMessage,
            customerContext,
            history: customerContext.history || [],
            intent: { type: 'NUMEROLOGY' },
            numerologyData: customerIntent.data,
            products: numResult.products,
            totalCount: numResult.totalCount,
            currentPage: 1,
            totalPages: numResult.totalPages
          });
          finalReply = `${numAnalysis}\n\n${numbersDisplay}`;
        }

        const t0Send = Date.now();
        await sendToGallabox(customerPhone, finalReply, channelID);
        const tSend = Date.now() - t0Send;
        console.log(`⚡ [PERF] Numerology served in ${Date.now() - reqStartTime}ms (DB: ${tContext}ms | Calc: ${Date.now() - t0Num}ms | Search: ${tSearch}ms | Gallabox: ${tSend}ms)`);
        await logInteraction({
          phone: customerPhone,
          name: customerName,
          userText: userMessage,
          botText: finalReply,
          isFail: false,
          model: 'agent-numerology',
          tokensUsed: 0,
          jsonQuery: { scoreSum: luckyScoreSum },
          page: 1
        }).catch(() => {});

        return res.status(200).json({ success: true, reason: 'numerology_served' });
      }

      tAi = 0;
      try {
        const t0Ai = Date.now();
        const parsed = await parseUserMessage(userMessage, customerContext.activeFilters);
        tAi = Date.now() - t0Ai;
        
        jsonQuery = parsed.result;
        parsedTokens = parsed.tokensUsed || parsed.tokens || 0;
        parsedModel = parsed.model || parsed.modelUsed || 'unknown';

        // Remove empty strings / nulls from jsonQuery
        if (jsonQuery && typeof jsonQuery === 'object') {
          for (const key in jsonQuery) {
            if (jsonQuery[key] === "" || jsonQuery[key] === null) {
              delete jsonQuery[key];
            }
          }
        }

        // LLM handles merge/new-search decision via the system prompt.
        // Refinement → LLM returns full merged JSON.
        // New search  → LLM returns only new filters.

        if (!jsonQuery || Object.keys(jsonQuery).length === 0) {
          const lang = customerContext.language || 'English';
          let errReply = "Sorry, I couldn't understand your request. Please be more specific. 💡\nExample: _req numbers ending with 555_";
          if (lang === 'English') {
            errReply = "Sorry, I couldn't understand your request. Please be more specific. 💡\nExample: _req numbers ending with 555_";
          } else if (lang === 'Hindi') {
            errReply = "माफ़ करें, आपकी query समझ नहीं आई। कृपया ज़्यादा detail में लिखें। 💡\nउदाहरण: _req numbers ending with 555_";
          } else if (lang === 'Gujarati') {
            errReply = "માફ કરો, તમારી query સમજાઈ નહિ. કૃપા કરી વધુ વિગત સાથે લખો. 💡\nઉદાહરણ: _req numbers ending with 555_";
          } else if (lang === 'Marathi') {
            errReply = "माफ करा, तुमची query समजली नाही. कृपया अधिक तपशीलात लिहा. 💡\nउदाहरण: _req numbers ending with 555_";
          }
          await sendToGallabox(customerPhone, errReply, channelID);
          return res.status(200).json({ success: true });
        }
      } catch (parseErr) {
        console.error('[Webhook] NLP Parse Error:', parseErr);
        const lang = customerContext.language || 'English';
        let errReply = "Sorry, something went wrong while understanding your request. Please try again. 🙏\nExample: _req 99 three times under 5000_";
        if (lang === 'English') {
          errReply = "Sorry, something went wrong while understanding your request. Please try again. 🙏\nExample: _req 99 three times under 5000_";
        } else if (lang === 'Hindi') {
          errReply = "माफ़ करें, आपकी query समझने में कुछ गड़बड़ हुई। कृपया दोबारा try करें। 🙏\nउदाहरण: _req 99 three times under 5000_";
        } else if (lang === 'Gujarati') {
          errReply = "માફ કરો, તમારી query સમજવામાં કંઈક ખૂટ્ઠ્ઠ્ઠ. કૃપા ફરી try કરો. 🙏\nઉદાહરણ: _req 99 three times under 5000_";
        } else if (lang === 'Marathi') {
          errReply = "माफ करा, तुमची query समजण्यात काहीतरी चूक झाली. कृपया पुन्हा try करा. 🙏\nउदाहरण: _req 99 three times under 5000_";
        }
        await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
      }
    }

    // ── Fetch results from external API ───────────────────────────────────
    const t0Search = Date.now();
    const result = await fetchNumbers(jsonQuery, page);
    const tSearch = Date.now() - t0Search;
    console.log(`[Webhook] Fetched ${result.products?.length || 0} products in ${tSearch}ms (page ${page}/${result.totalPages})`);

    // ── Format reply ──────────────────────────────────────────────────────
    if (!result.products || result.products.length === 0) {
      const lang = customerContext.language || 'English';
      
      let emptyMsg = '';
      let noMoreMsg = '';
      
      if (lang === 'English') {
        emptyMsg = `Oops! No numbers available matching your search right now. 😔\n\nPlease try another pattern (e.g., _req 9999_ or _mirror numbers_).`;
        noMoreMsg = `That's all the numbers we have! Please try a new search. 😊`;
      } else if (lang === 'Hindi') {
        emptyMsg = `माफ़ कीजिये! आपकी खोज से मैच करते हुए नंबर्स अभी उपलब्ध नहीं हैं। 😔\n\nकृपया कोई दूसरा पैटर्न ट्राई करें (जैसे, _req 9999_ या _mirror numbers_)।`;
        noMoreMsg = `यहीं तक थे नंबर्स! कृपया कोई नई सर्च करें। 😊`;
      } else if (lang === 'Gujarati') {
        emptyMsg = `માફ કરશો! તમારી શોધ સાથે મેળ ખાતા નંબર્સ હાલમાં ઉપલબ્ધ નથી. 😔\n\nકૃપા કરીને અન્ય પેટર્ન અજમાવો (દા.ત., _req 9999_).`;
        noMoreMsg = `અહીં સુધી જ નંબર્સ હતા! કૃપા કરીને નવી શોધ કરો. 😊`;
      } else if (lang === 'Marathi') {
        emptyMsg = `क्षमस्व! तुमच्या शोधाशी जुळणारे क्रमांक सध्या उपलब्ध नाहीत. 😔\n\nकृपया दुसरा पॅटर्न वापरून पहा (उदा., _req 9999_).`;
        noMoreMsg = `इतकेच क्रमांक उपलब्ध आहेत! कृपया नवीन शोध घ्या. 😊`;
      } else {
        // Hinglish
        emptyMsg = `Oops! Aapki search se match karte hue numbers abhi available nahi hain. 😔\n\nKoi dusra pattern try karein (e.g., _req 9999_ ya _mirror numbers_).`;
        noMoreMsg = `Yahi tak the numbers! Koi aur search karo. 😊`;
      }

      const t0Send = Date.now();
      if (page > 1) {
        await sendToGallabox(customerPhone, noMoreMsg, channelID);
      } else {
        await sendToGallabox(customerPhone, emptyMsg, channelID);
      }
      const tSend = Date.now() - t0Send;
      console.log(`⚡ [PERF] Empty search response served in ${Date.now() - reqStartTime}ms (DB: ${tContext}ms | AI [${parsedModel}]: ${tAi}ms | Search: ${tSearch}ms | Gallabox: ${tSend}ms)`);
      return res.status(200).json({ success: true });
    }

    const replyText = await generateSalesAgentResponse({
      userMessage,
      customerContext,
      history: customerContext.history || [],
      intent: { type: 'SEARCH' },
      products: result.products, 
      totalCount: result.totalCount, 
      currentPage: page, 
      totalPages: result.totalPages
    });

    const t0Send = Date.now();
    await sendToGallabox(customerPhone, replyText, channelID);
    const tSend = Date.now() - t0Send;
    console.log(`⚡ [PERF] Search response served in ${Date.now() - reqStartTime}ms (DB: ${tContext}ms | AI [${parsedModel}]: ${tAi}ms | Search: ${tSearch}ms | Gallabox: ${tSend}ms)`);

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

// sendToGallabox and addGallaboxTag are now in api/utils/gallabox.js
