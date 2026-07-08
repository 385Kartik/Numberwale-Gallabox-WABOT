import { parseUserMessage } from './utils/aiParser.js';
import { fetchNumbers, formatNumbersReply } from './utils/searchApi.js';
import { isShowMoreIntent, isBotPaused, pauseBot } from './utils/sessionStore.js';
import { getCustomerContext, logInteraction, updateCustomerInfo, resetActiveFilters } from './utils/analytics.js';
import { generateUPIQRCodeUrl, createRazorpayPaymentLink, fetchProductByNumber } from './utils/paymentUtils.js';

// ── Intent Detectors ────────────────────────────────────────────────────────
function extractBuyNumber(text) {
  const m = text.trim().match(/(?:buy|purchase)\s*(?:this)?\s*([\d\s\-]{10,15})/i);
  if (m) {
    const cleanNum = m[1].replace(/\D/g, '');
    if (cleanNum.length === 10) return cleanNum;
  }
  return null;
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

    const channelID = body?.channelId;

    // ── Gallabox Workflow: Agent Timeout Action ──
    if (req.query.action === 'agentTimeout' && customerPhone) {
      const customerContext = await getCustomerContext(customerPhone);
      if (customerContext.agentReplied) {
        console.log(`[Webhook] Agent already replied for ${customerPhone}. Skipping timeout fallback message.`);
        return res.status(200).json({ success: true, reason: 'agent_already_replied' });
      }

      console.log(`[Webhook] Agent timeout triggered for ${customerPhone}. Waking up bot.`);
      await updateCustomerInfo(customerPhone, { botState: 'ACTIVE' });
      
      const lang = customerContext.language || 'English';
      const activeFilters = customerContext.activeFilters || {};
      const hasSearch = Object.keys(activeFilters).length > 0;
      
      // Build a short summary of what customer was searching
      const searchSummary = hasSearch ? JSON.stringify(activeFilters) : null;

      let timeoutMsg = '';
      if (lang === 'English') {
        timeoutMsg = hasSearch
          ? `All our agents are currently busy. 😔\n\nBased on your search (_${searchSummary}_), do you want to:\n1️⃣ *Buy* one of the numbers shown earlier\n2️⃣ *More* – see more similar numbers\n\nType *buy <number>* or *more* to continue. Our agent will connect soon! 🙏`
          : `All our agents are currently busy. 😔 Do you want to buy a VIP number? Type your preference and I'll help you! 💁`;
      } else if (lang === 'Hindi') {
        timeoutMsg = hasSearch
          ? `हमारे सभी एजेंट अभी व्यस्त हैं। 😔\n\nआपकी खोज (_${searchSummary}_) के आधार पर, क्या आप:\n1️⃣ पहले दिखाए गए नंबरों में से *खरीदना* चाहते हैं?\n2️⃣ *और नंबर* देखना चाहते हैं?\n\n*buy <number>* या *more* टाइप करें। हमारा एजेंट जल्द जुड़ेगा! 🙏`
          : `हमारे सभी एजेंट अभी व्यस्त हैं। 😔 आप कोई VIP नंबर खरीदना चाहते हैं? अपनी पसंद लिखें, मैं मदद करूँगा! 💁`;
      } else if (lang === 'Gujarati') {
        timeoutMsg = hasSearch
          ? `અમારા તમામ એજન્ટ અત્યારે વ્યસ્ત છે। 😔\n\nતમારી શોધ (_${searchSummary}_) ના આધારે, શું તમે:\n1️⃣ પહેલા બતાવેલ નંબરોમાંથી *ખરીદવા* માંગો છો?\n2️⃣ *વધુ નંબર* જોવા માંગો છો?\n\n*buy <number>* અથવા *more* ટાઇપ કરો. અમારો એજન્ટ ટૂંક સમયમાં જોડાશે! 🙏`
          : `અમારા તમામ એજન્ટ અત્યારે વ્યસ્ત છે। 😔 શું તમે VIP નંબર ખરીદવા માંગો છો? તમારી પસંદ લખો! 💁`;
      } else if (lang === 'Marathi') {
        timeoutMsg = hasSearch
          ? `आमचे सर्व एजंट सध्या व्यस्त आहेत। 😔\n\nतुमच्या शोधाच्या (_${searchSummary}_) आधारावर, तुम्हाला:\n1️⃣ आधी दाखवलेल्या नंबरांपैकी *खरेदी* करायची आहे का?\n2️⃣ *आणखी नंबर* पहायचे आहेत का?\n\n*buy <number>* किंवा *more* टाइप करा. आमचा एजंट लवकरच जोडेल! 🙏`
          : `आमचे सर्व एजंट सध्या व्यस्त आहेत। 😔 तुम्हाला VIP नंबर खरेदी करायचा आहे का? तुमची पसंती लिहा! 💁`;
      } else {
        timeoutMsg = hasSearch
          ? `Hamare sabhi agents abhi busy hain. 😔\n\nAapki search (_${searchSummary}_) ke hisaab se:\n1️⃣ Pehle dikhaaye numbers mein se *kharidna* chahte ho?\n2️⃣ *Aur numbers* dekhna chahte ho?\n\n*buy <number>* ya *more* type karo. Hamara agent jald aayega! 🙏`
          : `Hamare sabhi agents abhi busy hain. 😔 Kya aap koi VIP number kharidna chahte hain? Apni preference likho! 💁`;
      }
      
      await sendToGallabox(customerPhone, timeoutMsg, channelID);
      return res.status(200).json({ success: true, reason: 'agent_timeout_handled' });
    }

    // ── Detect outbound / status events FIRST (before any text checks) ──
    // sender !== contactId means it was sent BY an agent, not the customer
    const isOutbound = body?.direction === 'OUTBOUND' ||
                       body?.message?.direction === 'outbound' ||
                       body?.message?.type === 'sent' ||
                       (body?.whatsapp?.to && !body?.whatsapp?.from) ||
                       (body?.sender && body?.contactId && body.sender !== body.contactId);
    const isStatusEvent = body?.event && !['message', 'message_received'].includes(body.event);

    if (isStatusEvent) {
      return res.status(200).json({ success: true, reason: 'status_event' });
    }

    if (isOutbound) {
      // Prevent the Bot's OWN outbound messages from being counted as a human agent reply
      const isSentByVercelBot = userMessage && userMessage.endsWith('\u200B');
      if (isSentByVercelBot) {
        console.log(`[Webhook] Ignoring outbound message sent by Vercel Bot itself.`);
        return res.status(200).json({ success: true, reason: 'vercel_bot_echo' });
      }

      // Only act on #bot on command; everything else silently drop
      if (userMessage && userMessage.trim().toLowerCase() === '#bot on') {
        console.log(`[Webhook] Employee resumed bot for ${customerPhone}.`);
        await updateCustomerInfo(customerPhone, { botState: 'ACTIVE', agentReplied: false });
        
        const customerContext = await getCustomerContext(customerPhone);
        const lang = customerContext.language || 'English';
        let resumeMsg = "👋 Hi! Main AI assistant wapas aa gaya hun.\n\nAapko kaise VIP mobile numbers chahiye?";
        
        if (lang === 'English') {
          resumeMsg = "👋 Hi! I am the AI assistant, back online.\n\nWhat kind of VIP mobile numbers are you looking for?";
        } else if (lang === 'Hindi') {
          resumeMsg = "👋 नमस्ते! मैं AI असिस्टेंट वापस आ गया हूँ।\n\nआपको कैसे VIP मोबाइल नंबर्स चाहिए?";
        } else if (lang === 'Gujarati') {
          resumeMsg = "👋 નમસ્તે! હું AI આસિસ્ટન્ટ પાછો આવી ગયો છું.\n\nતમારે કેવા VIP મોબાઈલ નંબર્સ જોઈએ છે?";
        } else if (lang === 'Marathi') {
          resumeMsg = "👋 नमस्कार! मी AI सहाय्यक परत आलो आहे.\n\nतुम्हाला कसे VIP मोबाईल नंबर पाहिजे आहेत?";
        }
        
        await sendToGallabox(customerPhone, resumeMsg, channelID);
        return res.status(200).json({ success: true });
      }

      // Any other outbound message from employee is considered an agent response
      console.log(`[Webhook] Outbound message received from agent for ${customerPhone}. Setting agentReplied = true.`);
      await updateCustomerInfo(customerPhone, { agentReplied: true });
      return res.status(200).json({ success: true, reason: 'outbound_tracked' });
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

    const lowerMsg = userMessage.toLowerCase().trim();

    // Fetch state from MongoDB early
    const customerName = body?.contact?.name || 'Unknown';
    const customerContext = await getCustomerContext(customerPhone, customerName);
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
    const agentRegex = /^(agent|human|talk|call|help|customer care|executive|insan|bhai|bhaiya|madad|सहायता)\b/i;
    const resetRegex = /^(menu|restart|reset|clear|start|शुरू|वापस)\b/i;
    const languageRegex = /^(language|change language|bhasha|bhasa|english|hindi|gujarati|marathi|hinglish|1|2|3|4|5|हिंदी|ગુજરાતી|मराठी|ભાષા|भाषा)\b/i;

    if (agentRegex.test(lowerMsg)) {
      await updateCustomerInfo(customerPhone, { botState: 'PAUSED', agentReplied: false });
      // 1. Tag in Gallabox → triggers 3-min Workflow timer
      await addGallaboxTag(customerPhone, "REQUIRE_AGENT", channelID);

      // 2. Notify Admin Panel in background → triggers round-robin assignment
      const ADMIN_API = process.env.ADMIN_API_URL || 'https://api.numberwale.com';
      const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || '';
      fetch(`${ADMIN_API}/api/v1/gallabox-bot/request-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': ADMIN_SECRET },
        body: JSON.stringify({
          phone: customerPhone,
          name: customerContext.name || '',
          language: customerContext.language || 'English',
          activeFilters: customerContext.activeFilters || {},
          conversationId: body?.conversationId || ''
        })
      }).then(r => console.log(`[Webhook] Admin notified for agent request: ${r.status}`))
        .catch(e => console.error(`[Webhook] Admin notification failed:`, e.message));

      const lang = customerContext.language || 'English';
      let errReply = "Aapki request hamare agent ko bhej di gayi hai. 2-3 minute mein connect honge. 👨‍💻";
      
      if (lang === 'English') {
        errReply = "Your request has been sent to our agent. They'll connect within 2-3 minutes. 👨‍💻\n\nIn the meantime, feel free to type *more* to see more numbers!";
      } else if (lang === 'Hindi') {
        errReply = "आपकी request हमारे agent को भेज दी गई है। वो 2-3 मिनट में connect होंगे। 👨‍💻\n\nतब तक *more* टाइप करके और नंबर देख सकते हैं!";
      } else if (lang === 'Gujarati') {
        errReply = "તમારી request અમારા agent ને મોકલી દેવામાં આવી છે. 2-3 મિનિટમાં connect થશે. 👨‍💻\n\nત્યાં સુધી *more* ટાઇપ કરી વધુ નંબર જુઓ!";
      } else if (lang === 'Marathi') {
        errReply = "तुमची request आमच्या agent ला पाठवली आहे. 2-3 मिनिटांत connect होतील. 👨‍💻\n\nत्याआधी *more* टाइप करून आणखी नंबर पाहू शकता!";
      }

      await sendToGallabox(customerPhone, errReply, channelID);
      return res.status(200).json({ success: true });
    }

    if (resetRegex.test(lowerMsg) && currentState === 'ACTIVE') {
      await resetActiveFilters(customerPhone);
      const errReply = "✅ Aapka pichla search reset kar diya gaya hai.\n\nAap naya number kaisa chahte hain? (e.g., 'need mirror numbers under 5000')";
      await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
    }

    const isWebsiteDefaultMsg = lowerMsg.includes('found your website') || lowerMsg.includes('question about fancy numbers');
    if (isWebsiteDefaultMsg) {
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_LANGUAGE', language: null });
      const langReply = "👋 Hello! How can I help you? / नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nPlease select your preferred language / कृपया अपनी भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. ગુજરાતી (Gujarati)\n4. मराठी (Marathi)\n5. Hinglish";
      await sendToGallabox(customerPhone, langReply, channelID);
      return res.status(200).json({ success: true });
    }

    if (currentState !== 'AWAITING_LANGUAGE' && languageRegex.test(lowerMsg)) {
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_LANGUAGE', language: null });
      const langReply = "👋 Hello! How can I help you? / नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nPlease select your preferred language / कृपया अपनी भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. ગુજરાતી (Gujarati)\n4. मराठी (Marathi)\n5. Hinglish";
      await sendToGallabox(customerPhone, langReply, channelID);
      return res.status(200).json({ success: true });
    }

    // ── State Machine: Onboarding ─────────────────────────────────────────
    if (currentState === 'NEW') {
      if (!customerContext.language) {
        const langReply = "👋 Hello! How can I help you? / नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nPlease select your preferred language / कृपया अपनी भाषा चुनें:\n1. English\n2. हिंदी (Hindi)\n3. ગુજરાતી (Gujarati)\n4. मराठी (Marathi)\n5. Hinglish";
        await updateCustomerInfo(customerPhone, { botState: 'AWAITING_LANGUAGE' });
        await sendToGallabox(customerPhone, langReply, channelID);
        return res.status(200).json({ success: true });
      }
      // Should not reach here normally, but just in case
      currentState = 'AWAITING_INFO';
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
        return res.status(200).json({ success: true });
      }
      
      let welcomeReply = "Welcome to Numberwale! 🎉\n\nWe will help you find the best VIP mobile numbers.\n\nPlease type your *Name* and *6-digit Pincode* so we can check local availability.\n\nExample: _Rahul 131001_";
      
      if (chosenLanguage === 'English') {
        welcomeReply = "Welcome to Numberwale! 🎉\n\nWe will help you find the best VIP mobile numbers.\n\nPlease type your *Name* and *6-digit Pincode* so we can check local availability.\n\nExample: _Rahul 131001_";
      } else if (chosenLanguage === 'Hindi') {
        welcomeReply = "नंबरवाले में आपका स्वागत है! 🎉\n\nहम आपको बेस्ट VIP मोबाइल नंबर ढूंढने में मदद करेंगे।\n\nकृपया अपना *नाम* और *6-अंकों का पिनकोड* लिखकर भेजें ताकि हम लोकल उपलब्धता चेक कर सकें।\n\nउदाहरण: _Rahul 131001_";
      } else if (chosenLanguage === 'Gujarati') {
        welcomeReply = "નંબરવાલેમાં તમારું સ્વાગત છે! 🎉\n\nઅમે તમને શ્રેષ્ઠ VIP મોબાઈલ નંબર શોધવામાં મદદ કરીશું.\n\nકૃપા કરીને તમારું *નામ* અને *6-આંકડાનો પિનકોડ* લખીને મોકલો જેથી અમે લોકલ ઉપલબ્ધતા ચેક કરી શકીએ.\n\nઉદાહરણ: _Rahul 131001_";
      } else if (chosenLanguage === 'Marathi') {
        welcomeReply = "नंबरवाले मध्ये आपले स्वागत आहे! 🎉\n\nआम्ही तुम्हाला सर्वोत्तम VIP मोबाईल नंबर शोधण्यात मदत करू.\n\nकृपया तुमचे *नाव* आणि *६-अंकी पिनकोड* टाईप करून पाठवा जेणेकरून आम्ही लोकल उपलब्धता तपासू शकू.\n\nउदाहरण: _Rahul 131001_";
      } else if (chosenLanguage === 'Hinglish') {
        welcomeReply = "Welcome to Numberwale! 🎉\n\nHum aapko best VIP mobile numbers dhundhne mein madad karenge.\n\nKripya apna *Naam* aur *6-digit Pincode* type karke bhejein taaki hum local availability check kar sakein.\n\nExample: _Rahul 131001_";
      }
      
      await updateCustomerInfo(customerPhone, { botState: 'AWAITING_INFO', language: chosenLanguage });
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

        const lang = customerContext.language || 'English';
        let instructions = `Awesome, ${extractedName}! Aapka Pincode ${extractedPin} save ho gaya hai. 🎉\n\nAap kaise VIP number dhoondh rahe hain? Aap mujhe bata sakte hain:\n\n` +
          `🔹 _"Need mirror numbers under 5000"_\n` +
          `🔹 _"9999 ending without 4 and 8"_\n` +
          `🔹 _"Sum 5 numbers"_\n\n` +
          `Type kijiye aur hum numbers fetch karenge!`;

        if (lang === 'English') {
          instructions = `Awesome, ${extractedName}! Your Pincode ${extractedPin} has been saved. 🎉\n\nWhat kind of VIP number are you looking for? You can tell me:\n\n` +
            `🔹 _"Need mirror numbers under 5000"_\n` +
            `🔹 _"9999 ending without 4 and 8"_\n` +
            `🔹 _"Sum 5 numbers"_\n\n` +
            `Just type your query and we will fetch the numbers!`;
        } else if (lang === 'Hindi') {
          instructions = `बढ़िया, ${extractedName}! आपका पिनकोड ${extractedPin} सेव हो गया है। 🎉\n\nआप कैसा VIP नंबर ढूंढ रहे हैं? आप मुझे बता सकते हैं:\n\n` +
            `🔹 _"Need mirror numbers under 5000"_\n` +
            `🔹 _"9999 ending without 4 and 8"_\n` +
            `🔹 _"Sum 5 numbers"_\n\n` +
            `टाइप कीजिए और हम आपके लिए नंबर्स खोजेंगे!`;
        } else if (lang === 'Gujarati') {
          instructions = `સરસ, ${extractedName}! તમારો પિનકોડ ${extractedPin} સેવ થઈ ગયો છે. 🎉\n\nતમે કેવો VIP નંબર શોધી રહ્યા છો? તમે મને કહી શકો છો:\n\n` +
            `🔹 _"Need mirror numbers under 5000"_\n` +
            `🔹 _"9999 ending without 4 and 8"_\n` +
            `🔹 _"Sum 5 numbers"_\n\n` +
            `ટાઈપ કરો અને અમે તમારા માટે નંબર્સ શોધીશું!`;
        } else if (lang === 'Marathi') {
          instructions = `उत्तम, ${extractedName}! तुमचा पिनकोड ${extractedPin} सेव्ह झाला आहे. 🎉\n\nतुम्ही कसा VIP नंबर शोधत आहात? तुम्ही मला सांगू शकता:\n\n` +
            `🔹 _"Need mirror numbers under 5000"_\n` +
            `🔹 _"9999 ending without 4 and 8"_\n` +
            `🔹 _"Sum 5 numbers"_\n\n` +
            `टाईप करा आणि आम्ही तुमच्यासाठी नंबर शोधू!`;
        }

        await sendToGallabox(customerPhone, instructions, channelID);
        return res.status(200).json({ success: true });
      } else {
        const lang = customerContext.language || 'English';
        let errReply = "❌ Invalid format.\n\nKripya apna *Naam* aur *6-digit Pincode* ek sath likh kar bhejein.\nExample: _Rahul 131001_";

        if (lang === 'English') {
          errReply = "❌ Invalid format.\n\nPlease type your *Name* and *6-digit Pincode* together.\nExample: _Rahul 131001_";
        } else if (lang === 'Hindi') {
          errReply = "❌ गलत फॉर्मेट।\n\nकृपया अपना *नाम* और *6-अंकों का पिनकोड* एक साथ लिखकर भेजें।\nउदाहरण: _Rahul 131001_";
        } else if (lang === 'Gujarati') {
          errReply = "❌ ખોટું ફોર્મેટ.\n\nકૃપા કરીને તમારું *નામ* અને *6-આંકડાનો પિનકોડ* એકસાથે લખીને મોકલો.\nઉદાહરણ: _Rahul 131001_";
        } else if (lang === 'Marathi') {
          errReply = "❌ चुकीचे स्वरूप.\n\nकृपया तुमचे *नाव* आणि *६-अंकी पिनकोड* एकत्र लिहून पाठवा.\nउदाहरण: _Rahul 131001_";
        }

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
        const lang = customerContext.language || 'English';
        let replyText = "Pehle koi search karo, phir *'show more'* likho! 😊\nExample: _req 99 two times_";
        
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

        // Temporarily hardcoded to localhost as requested by user
        const FRONTEND_URL = 'http://localhost:5174';
        const checkoutLink = `${FRONTEND_URL}/cart-add/${buyNumber}`;

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

        const caption = `🛒 *Your Checkout Link is Ready!*\n\n` +
          `📱 Number: *${buyNumber}*\n\n` +
          priceBreakdown +
          `🔒 *Click the link below to pay securely (Real-time Inventory Check):*\n` +
          `${checkoutLink}\n\n` +
          `_You can pay via UPI QR or Razorpay on the checkout page._`;

        await sendToGallabox(customerPhone, caption, channelID);

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
      const greetingRegex = /^(hi|hello|hii|helo|hey|ok|okay|thanks|thank you|shukriya|theek hai|thik hai|👍|🙏|haan|ha|yes|no|nahi|hmm|hm|good|great|nice|👌)$/i;
      if (greetingRegex.test(lowerMsg.trim())) {
        const lang = customerContext.language || 'English';
        const hasFilters = customerContext.activeFilters && Object.keys(customerContext.activeFilters).length > 0;
        let greetMsg = '';

        if (lang === 'Hindi') {
          greetMsg = hasFilters 
            ? `😊 कोई बात नहीं! क्या आप अपनी पिछली खोज जारी रखना चाहते हैं या नई खोज करना चाहते हैं?\n\n👉 अगले पेज के लिए *"more"* रिप्लाई करें\n👉 नई खोज के लिए *"reset"* रिप्लाई करें\n👉 भाषा बदलने के लिए *"language"* रिप्लाई करें`
            : `👋 नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?\n\nउदाहरण: _req 786 numbers under 20000_\n\n👉 भाषा बदलने के लिए *"language"* रिप्लाई करें`;
        } else if (lang === 'Gujarati') {
          greetMsg = hasFilters 
            ? `😊 કોઈ વાંધો નહિ! શું તમે તમારી અગાઉની શોધ ચાલુ રાખવા માંગો છો કે નવી શોધ કરવા માંગો છો?\n\n👉 આગળના પેજ માટે *"more"* રિપ્લાય કરો\n👉 નવી શોધ માટે *"reset"* રિપ્લાય કરો\n👉 ભાષા બદલવા માટે *"language"* રિપ્લાય કરો`
            : `👋 નમસ્તે! હું તમારી કેવી રીતે મદદ કરી શકું?\n\nઉદાહરણ: _req 786 numbers under 20000_\n\n👉 ભાષા બદલવા માટે *"language"* રિપ્લાય કરો`;
        } else if (lang === 'Marathi') {
          greetMsg = hasFilters 
            ? `😊 काही हरकत नाही! तुम्हाला तुमची मागील शोध चालू ठेवायची आहे की नवीन शोध करायची आहे?\n\n👉 पुढच्या पेजसाठी *"more"* रिप्लाय करा\n👉 नवीन शोधसाठी *"reset"* रिप्लाय करा\n👉 भाषा बदलण्यासाठी *"language"* रिप्लाय करा`
            : `👋 नमस्कार! मी तुमची कशी मदत करू शकतो?\n\nउदाहरण: _req 786 numbers under 20000_\n\n👉 भाषा बदलण्यासाठी *"language"* रिप्लाय करा`;
        } else if (lang === 'Hinglish') {
          greetMsg = hasFilters 
            ? `😊 Koi baat nahi! Kya aap apni pichli search continue karna chahte hain ya naya search karna hai?\n\n👉 Reply *"more"* for next page\n👉 Reply *"reset"* for new search\n👉 Reply *"language"* to change language`
            : `👋 Hello! Main aapki kaise madad kar sakta hun?\n\nExample: _req 786 numbers under 20000_\n\n👉 Reply *"language"* to change language`;
        } else {
          greetMsg = hasFilters 
            ? `😊 No problem! Would you like to continue your previous search or start a new one?\n\n👉 Reply *"more"* for next page\n👉 Reply *"reset"* for new search\n👉 Reply *"language"* to change language`
            : `👋 Hello! How can I help you today?\n\nExample: _req 786 numbers under 20000_\n\n👉 Reply *"language"* to change language`;
        }

        await sendToGallabox(customerPhone, greetMsg, channelID);
        return res.status(200).json({ success: true });
      }

      try {
        const parsed = await parseUserMessage(userMessage, customerContext.activeFilters);
        
        jsonQuery = parsed.result;
        parsedTokens = parsed.tokens || 0;
        parsedModel = parsed.modelUsed;

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
          const errReply = "Maafi chahta hun, aapki query samajh nahi aayi. Kripya pura likhein.\nExample: _req numbers ending with 555_";
          await sendToGallabox(customerPhone, errReply, channelID);
          return res.status(200).json({ success: true });
        }
      } catch (parseErr) {
        console.error('[Webhook] NLP Parse Error:', parseErr);
        const errReply = "Maafi chahta hun, aapki query samajh nahi aayi. Kripya dobara try karein.\nExample: _req 99 three times under 5000_";
        await sendToGallabox(customerPhone, errReply, channelID);
        return res.status(200).json({ success: true });
      }
    }

    // ── Fetch results from external API ───────────────────────────────────
    const result = await fetchNumbers(jsonQuery, page);
    console.log(`[Webhook] Fetched ${result.products?.length || 0} products (page ${page}/${result.totalPages})`);

    // ── Format reply ──────────────────────────────────────────────────────
    if (!result.products || result.products.length === 0) {
      const lang = customerContext.language || 'English';
      const prettyCriteria = JSON.stringify(jsonQuery);
      
      let emptyMsg = '';
      let noMoreMsg = '';
      
      if (lang === 'English') {
        emptyMsg = `Oops! No numbers available matching your criteria (${prettyCriteria}) right now. 😔\n\nPlease try another pattern (e.g., _req 9999_).`;
        noMoreMsg = `That's all the numbers we have! Please try a new search. 😊`;
      } else if (lang === 'Hindi') {
        emptyMsg = `माफ़ कीजिये! आपके क्राइटेरिया (${prettyCriteria}) से मैच करते हुए नंबर्स अभी उपलब्ध नहीं हैं। 😔\n\nकृपया कोई दूसरा पैटर्न ट्राई करें (जैसे, _req 9999_)।`;
        noMoreMsg = `यहीं तक थे नंबर्स! कृपया कोई नई सर्च करें। 😊`;
      } else if (lang === 'Gujarati') {
        emptyMsg = `માફ કરશો! તમારા માપદંડ (${prettyCriteria}) સાથે મેળ ખાતા નંબર્સ હાલમાં ઉપલબ્ધ નથી. 😔\n\nકૃપા કરીને અન્ય પેટર્ન અજમાવો (દા.ત., _req 9999_).`;
        noMoreMsg = `અહીં સુધી જ નંબર્સ હતા! કૃપા કરીને નવી શોધ કરો. 😊`;
      } else if (lang === 'Marathi') {
        emptyMsg = `क्षमस्व! तुमच्या निकषांशी (${prettyCriteria}) जुळणारे क्रमांक सध्या उपलब्ध नाहीत. 😔\n\nकृपया दुसरा पॅटर्न वापरून पहा (उदा., _req 9999_).`;
        noMoreMsg = `इतकेच क्रमांक उपलब्ध आहेत! कृपया नवीन शोध घ्या. 😊`;
      } else {
        // Hinglish
        emptyMsg = `Oops! Aapke criteria (${prettyCriteria}) se match karte hue numbers abhi available nahi hain. 😔\n\nKoi dusra pattern try karein (e.g., _req 9999_).`;
        noMoreMsg = `Yahi tak the numbers! Koi aur search karo. 😊`;
      }

      if (page > 1) {
        await sendToGallabox(customerPhone, noMoreMsg, channelID);
        return res.status(200).json({ success: true });
      } else {
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
      let retries = 3;
      while (retries > 0) {
        try {
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
              },
              timeout: 5000 // 5 seconds timeout for sending message
            }
          );
          console.log(`[Webhook] ✉️  Reply sent to ${phone} via Gallabox`);
          break; // Success, break the retry loop
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          console.log(`[Webhook] ⚠️ Gallabox send failed, retrying... (${retries} attempts left)`);
          await new Promise(res => setTimeout(res, 500)); // wait 500ms before retry
        }
      }
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
