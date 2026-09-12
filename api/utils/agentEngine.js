/**
 * agentEngine.js — Autonomous AI Sales Agent for Numberwale VIP Mobile Numbers
 * 
 * Provides:
 * 1. NUMBERWALE_KNOWLEDGE_BASE: Complete ground truth on MNP, timelines, delivery, legal, numerology, FAQs
 * 2. Intent Detection: SEARCH, NUMEROLOGY, FAQ, DISCOUNT, PROCESS, TRUST
 * 3. Numerology & Astrology Calculator: Mulank (Driver) & Bhagyank (Conductor) calculation
 * 4. Conversational Responses: Multilingual, charismatic sales consultant persona
 */

import { runLocalAgentChat } from './aiParser.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. GROUND TRUTH BUSINESS KNOWLEDGE BASE (From Numberwale.com Codebase)
// ─────────────────────────────────────────────────────────────────────────────
export const NUMBERWALE_KNOWLEDGE = {
  brand: "Numberwale",
  tagline: "Your Number, Your Identity",
  legacy: "Since 2010 (10+ Years of Trust & Excellence)",
  customers: "1 Lakh+ (100,000+) Happy Customers across India",
  helpline: "+91 9222 222 007 (10:00 AM – 7:00 PM Mon–Sat)",
  email: "support@numberwale.com",
  officeAddress: "005, Building no.12-B, Sangeet Complex, Jesal Park, Bhayandar East, Thane / Mumbai, Maharashtra 401105, India",
  officeHours: "10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays)",
  
  // 4-Step MNP Porting & Activation Journey
  process: {
    intro: "Your purchased VIP mobile number can be activated with any telecom operator (Jio, Airtel, Vi or BSNL; BSNL subject to availability) anywhere in India through Mobile Number Portability (MNP). A Unique Porting Code (UPC) is mandatory to activate your VIP mobile number through the MNP process.",
    step1: "1️⃣ Order Confirmation: Once payment is confirmed, the UPC generation process begins.",
    step2: "2️⃣ UPC Generation: The UPC will be shared via SMS within 24 working hours. Valid for a limited period; submit MNP request at least 1 day before expiration.",
    step3: "3️⃣ Visit a Store: Carry Aadhaar Card and UPC. Visit official operator store OR nearby local mobile store for MNP & SIM issuance (for postpaid, visit official operator store).",
    step4: "4️⃣ Number Activation: Activated as per operator's standard MNP timeline (3-5 business days nationwide).",
    guarantee: "100% Money-Back Guarantee if porting fails due to any operator technical error.",
    upcValidity: "Standard UPC is valid for a limited period. If it expires before you visit the store, Numberwale issues a fresh UPC at zero extra cost.",
    support: "Numberwale is your One-Stop Solution. NEVER contact operator customer care for Numberwale orders or UPC issues. Connect directly with Numberwale (+91 9222 222 007 / WhatsApp) for instant resolution or 100% refund."
  },

  // Networks & Compatibility
  networks: {
    operators: "All Indian telecom operators: Reliance Jio, Bharti Airtel, Vodafone Idea (Vi), and BSNL.",
    compatibility: "Works on all 4G & 5G mobile devices seamlessly.",
    planType: "You can choose either Prepaid or Postpaid at the operator store during biometric KYC.",
    esim: "Yes, once the physical SIM activates, you can convert it to an eSIM through your operator's standard process."
  },

  // Pricing, Payments & Discounts
  pricing: {
    gst: "All prices are transparent and include official 18% GST invoice (business clients can claim GST input credit).",
    maintenance: "One-time cost only. Zero monthly maintenance fees to Numberwale. Afterwards, you only pay your regular operator recharge plan.",
    cod: "Cash on Delivery (COD) is not possible because the Unique Porting Code (UPC) is delivered digitally within 24 hours.",
    discounts: "Website listed prices already include maximum up to 50% discount. For high-value VIP numbers or bulk/family packs, a senior manager can assist with exclusive offers."
  },

  // Numerology Meaning of Numbers (1-9)
  numerology: {
    1: { planet: "Sun (Surya)", traits: "Leadership, Government, Executive, Authority, High Ambition" },
    2: { planet: "Moon (Chandra)", traits: "Harmony, Diplomacy, Public Relations, Creativity, Peace" },
    3: { planet: "Jupiter (Guru)", traits: "Wisdom, Knowledge, Wealth, Counseling, Growth, Education" },
    4: { planet: "Rahu", traits: "Technology, Innovation, Strategic Planning, Modern Ventures" },
    5: { planet: "Mercury (Budh)", traits: "Business, Trading, Commerce, Sales, Marketing, Fast Growth (Universally Auspicious)" },
    6: { planet: "Venus (Shukra)", traits: "Luxury, Glamour, Wealth, Automobiles, Fame, Real Estate (Most Popular for VIPs)" },
    7: { planet: "Ketu", traits: "Research, Analysis, Occult, Spiritual, Deep Insight" },
    8: { planet: "Saturn (Shani)", traits: "Real Estate, Long-term Asset Building, Justice, Manufacturing, Stability" },
    9: { planet: "Mars (Mangal)", traits: "Energy, Courage, Real Estate, Defense, Sports, Dynamic Action" }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. NUMEROLOGY CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
export function calculateNumerology(text) {
  if (!text) return null;

  // 1. Full numeric date DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const fullDateMatch = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  
  // 2. Date with month name: "15 Aug 1995", "15th August 1995", "15 August"
  const monthNames = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };
  const wordDateMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{2,4}))?\b/i);

  // 3. Explicit day with DOB keyword: "dob 15", "bday 24", "born on 5", "birthdate 9", "birthday 18", "tarikh 12"
  const explicitDayMatch = text.match(/\b(?:dob|birth\s*(?:date|day)?|bday|birthday|tarikh|tithi|born\s*(?:on)?|janam\s*(?:din|tarikh)?)\s*[:=]?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);

  let day = null;
  let month = null;
  let year = null;

  if (fullDateMatch) {
    day = parseInt(fullDateMatch[1], 10);
    month = parseInt(fullDateMatch[2], 10);
    year = parseInt(fullDateMatch[3], 10);
    if (year < 100) year += year < 30 ? 2000 : 1900;
  } else if (wordDateMatch) {
    day = parseInt(wordDateMatch[1], 10);
    month = monthNames[wordDateMatch[2].toLowerCase()] || null;
    if (wordDateMatch[3]) {
      year = parseInt(wordDateMatch[3], 10);
      if (year < 100) year += year < 30 ? 2000 : 1900;
    }
  } else if (explicitDayMatch) {
    day = parseInt(explicitDayMatch[1], 10);
  }

  if (!day || day < 1 || day > 31) return null;
  if (month && (month < 1 || month > 12)) return null;

  // Reduce to single digit (Mulank / Driver Number)
  function reduceToSingle(n) {
    let s = n;
    while (s > 9) {
      s = String(s).split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    }
    return s;
  }

  const mulank = reduceToSingle(day);
  let bhagyank = null;

  if (month && year) {
    const totalDateSum = String(day) + String(month) + String(year);
    const digitsSum = totalDateSum.split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    bhagyank = reduceToSingle(digitsSum);
  }

  const planetInfo = NUMBERWALE_KNOWLEDGE.numerology[mulank] || { planet: "Auspicious", traits: "Positive Growth" };

  return {
    day,
    month,
    year,
    mulank,
    bhagyank,
    planet: planetInfo.planet,
    traits: planetInfo.traits,
    recommendedScoreSum: mulank
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 3. INTENT DETECTOR & LANGUAGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────
export function detectLanguage(text, prevLang = 'English') {
  if (!text || !text.trim()) return prevLang;
  const t = text.trim();

  // 1. Script-based detection
  // Gujarati script
  if (/[\u0A80-\u0AFF]/.test(t)) return 'Gujarati';

  // Devanagari script (Hindi / Marathi) - Note: Do not use \b with Devanagari in JS regex
  if (/[\u0900-\u097F]/.test(t)) {
    if (/(?:आहे|नाही|कसा|कशी|करा|हवा|हवे|घ्यायचा|घ्यायचे|नमस्कार|पाहिजे|धन्यवाद)/.test(t)) {
      return 'Marathi';
    }
    return 'Hindi';
  }

  // 2. Pure numbers or short neutral greetings/commands: retain previous language
  if (/^[\d\s\-\+\(\)]+$/.test(t) || /^(more|reset|menu|agent|hi|hello|hey|ok|okay|sure|thanks|thank you)$/i.test(t)) {
    return prevLang || 'English';
  }

  const lower = t.toLowerCase();

  // 3. Roman Gujarati
  if (/\b(kem\s*cho|maja\s*ma|chhe|chho|joye|joyie|aapo|tamare|tamne|mane|ketla|nathi|su\s*bhav|shu\s*bhav|bhav\s*shu)\b/i.test(lower)) {
    return 'Gujarati';
  }

  // 4. Roman Marathi
  if (/\b(kasa\s*aahes|kasa\s*ahes|aahe|pahije|havay|kiti\s*padel|dya|sang|bol)\b/i.test(lower)) {
    return 'Marathi';
  }

  // 5. Roman Hindi / Hinglish indicators
  const hinglishRegex = /\b(hai|hain|ho|kya|kyu|kyun|kaise|kaisa|kaisi|chahiye|chahie|batao|bataiye|dikhao|dikhaye|dekhna|milega|milegi|kitna|kitne|kitni|kam\s*karo|thoda|bhai|bhaiya|sirji|mujhe|humko|hume|mera|meri|mere|apna|apni|apne|kuch|achha|accha|shubh|janam|naam|bhejo|saste|hoga|hogi|hoge|lena|lenahai|dena|karna|wala|wali|wale|bhi|toh|aur|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|shukriya|dhanyawad)\b/i;

  if (hinglishRegex.test(lower)) {
    return 'Hinglish';
  }

  // 6. If no Indian language keywords found -> English!
  return 'English';
}

export function detectCustomerIntent(rawMsg) {
  if (!rawMsg) return { type: 'SEARCH' };
  const text = rawMsg.toLowerCase().trim();

  // 0. Greetings, Affirmations, Exploratory, Conversational Discovery
  const consultativeChatRegex = /\b(hi|hello|hii|helo|hey|ok|okay|okau|okie|okk|done|sure|theek\s*hai|thik\s*hai|sahi\s*hai|accha|achha|acha|shukriya|thanks|thank\s*you|👍|🙏|👌|haan|ha|yes|yep|batao|bataiye|bolo|bata|suggest|guide|help|samjhao|kaisa\s*number|kaise\s*choose|kya\s*fayda|kya\s*faida|faayda|fayda|kya\s*rate|kya\s*price|kuch\s*accha|kuch\s*badhiya|trending|popular|best\s*number|top\s*number|business\s*ke\s*liye|personal\s*ke\s*liye|calling\s*ke\s*liye|namaste|kem\s*cho|pranam|kaisa\s*hai|kaise\s*ho)\b/i;
  
  const hasSearchKeywords = /\b(req|ending|starts?|last|first|contains?|without|digits?|price|budget|sum|total|under|below|above|between)\b/i.test(text) ||
                            /\b\d{3,10}\b/.test(text);

  if (consultativeChatRegex.test(text) && !hasSearchKeywords) {
    return { type: 'CONSULTATIVE_CHAT' };
  }

  // 1. Numerology Intent
  const numRegex = /\b(numerology|astro|astrology|moolank|mulank|bhagyank|kundali|rashi|lucky\s*number|kismat|date\s*of\s*birth|dob|tarikh|tithi|bday|birthday|janamdin|janam\s*tarikh)\b/i;
  const hasDatePattern = /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(text) || 
                         /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text) ||
                         /\b(?:dob|birth\s*(?:date|day)?|bday|birthday|tarikh|tithi|born\s*(?:on)?|janamdin)\s*[:=]?\s*\d{1,2}\b/i.test(text);

  if (numRegex.test(text) || hasDatePattern) {
    const numData = calculateNumerology(text);
    return { type: 'NUMEROLOGY', data: numData };
  }

  // 2. FAQ: Process, Porting & MNP
  if (/\b(mnp|port|porting|upc|upc\s*code|activate|activation|process|kaise\s*milega|sim\s*kaise|kaise\s*chalu|kitna\s*time|how\s*many\s*days|store\s*jana|aadhar|kyc|ekyc)\b/i.test(text)) {
    return { type: 'FAQ_PROCESS' };
  }

  // 3. FAQ: Network, Compatibility, 5G, eSIM
  if (/\b(jio|airtel|vi|vodafone|idea|bsnl|5g|4g|esim|e-sim|postpaid|prepaid|network)\b/i.test(text) && !/\b(number|sim|req|chahiye|digits)\b/i.test(text)) {
    return { type: 'FAQ_NETWORK' };
  }

  // 4. FAQ: Pricing, Discount, Negotiation, COD
  if (/\b(discount|kam\s*karo|bargain|sasta|offer|cod|cash\s*on\s*delivery|installment|emi|gst|invoice)\b/i.test(text)) {
    return { type: 'FAQ_PRICING' };
  }

  // 5. FAQ: Trust, Legality, Office Location, Money Back Guarantee
  if (/\b(trust|fraud|fake|real|genuine|legal|guarantee|refund|money\s*back|office|kaha\s*hai|location|address|mumbai|thane|bhayandar)\b/i.test(text)) {
    return { type: 'FAQ_TRUST' };
  }

  // 6. Default: Search & Recommend
  return { type: 'SEARCH' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SMART CONVERSATIONAL GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a friendly, knowledgeable, high-converting AI Agent reply for FAQs.
 */
export async function generateFaqReply({ intentType, userMessage, customerContext }) {
  const lang = customerContext.language || 'English';
  const name = customerContext.name && customerContext.name !== 'Unknown' ? customerContext.name : '';
  const greeting = name ? `${name} ji` : '';

  // Prompt for LLM with official facts
  const systemPrompt = `You are Eva, Senior VIP Mobile Number Consultant at Numberwale (India's leading VIP mobile number company since 2010, 10+ years legacy, 1 Lakh+ happy clients). You have an elegant, warm, charming female personality (ladki ki personality).
CRITICAL FEMALE GRAMMAR RULE (HINDI / HINGLISH / MARATHI): Always use natural female grammatical verb endings for yourself! Use "karti hoon" (never "karta hoon"), "bataungi" / "bata sakti hoon" (never "bataunga"), "dekh sakti hoon", "madad kar sakti hoon" (never "kar sakta hoon"), "nikal ke deti hoon" (never "deta hun").
Your job is to answer customer questions about Numberwale warmly, clearly, accurately, and sales-consultatively.

FACTS TO USE STRICTLY:
- MNP/Process: 4-step process.
  • Intro: Your purchased VIP mobile number can be activated with any telecom operator (Jio, Airtel, Vi or BSNL; BSNL subject to availability) anywhere in India through Mobile Number Portability (MNP). A Unique Porting Code (UPC) is mandatory to activate your VIP mobile number through the MNP process.
  • Step 1 (Order Confirmation): Once payment is confirmed, UPC generation process begins.
  • Step 2 (UPC Generation): UPC shared via SMS within 24 working hours. Valid for limited period; submit MNP request at least 1 day before expiration.
  • Step 3 (Visit a Store): Carry original Aadhaar Card and UPC to any official telecom operator store or local mobile store for MNP & SIM issuance (for postpaid, visit official operator store).
  • Step 4 (Number Activation): Activated as per operator's standard MNP timeline (3-5 business days nationwide).
- 🚨 One-Stop Solution: NEVER tell customer to contact telecom operator customer care! Telecom operators do NOT handle Numberwale orders or UPCs. Numberwale is their 100% one-stop solution. Free replacement UPC or 100% money-back guarantee.
- Office Hours & Calls: 10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays). Calls cannot be answered after office hours.
- Networks: Works with any operator (Jio, Airtel, Vi, BSNL). Works on 4G/5G, can be activated as Prepaid or Postpaid, can convert to eSIM.
- Guarantee: 100% Money Back Guarantee if porting fails. UPC is valid for limited days; if expired, Numberwale provides a fresh UPC free of cost.
- Payments: 100% online & secure (UPI, Google Pay, PhonePe, Cards, Netbanking, Credit Card EMI). No COD because UPC is digital. Official GST invoice provided.
- Office: Head office in Bhayandar East, Thane / Mumbai, Maharashtra. Helpline: +91 9222 222 007 (10am–7pm Mon–Sat).

TONE & RULES:
- STRICT LANGUAGE RULE: You must respond PURELY and STRICTLY in ${lang}. DO NOT mix languages. DO NOT append Hindi words if the language is English. Never output gibberish.
- Address customer politely as "${greeting || 'ji'}".
- Length: 3 to 5 clear sentences with relevant emojis.
- ALWAYS conclude by warmly asking what kind of VIP number, pattern, or budget they are looking for today!`;

  try {
    const aiResponse = await runLocalAgentChat({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.35,
      maxTokens: 300
    });

    if (aiResponse && aiResponse.length > 20) {
      return aiResponse;
    }
  } catch (err) {
    console.log(`[AgentEngine] 🔄 LLM Chat failed (${err.message}) -> FALLBACK ACTIVE: Using instant pre-verified FAQ template.`);
  }

  // Instant High-Quality Fallbacks if LLM fails or is slow
  if (intentType === 'FAQ_PROCESS') {
    if (lang === 'Hindi') {
      return `नमस्ते ${greeting}! 🙏 नंबरवाले से VIP नंबर लेना और एक्टिवेट करना बेहद आसान है:\n\n` +
        `आपके द्वारा खरीदा गया VIP मोबाइल नंबर MNP के ज़रिए पूरे भारत में किसी भी ऑपरेटर (Jio, Airtel, Vi या BSNL) पर एक्टिवेट किया जा सकता है। MNP प्रक्रिया के लिए Unique Porting Code (UPC) अनिवार्य होता है।\n\n` +
        `1️⃣ *Order Confirmation:* पेमेंट कन्फर्म होते ही UPC जनरेशन शुरू हो जाता है।\n` +
        `2️⃣ *UPC Generation:* 24 वर्किंग घंटों के अंदर SMS द्वारा UPC भेज दिया जाता है। यह सीमित समय के लिए मान्य होता है, अतः एक्सपायर होने से कम से कम 1 दिन पहले MNP सबमिट करें।\n` +
        `3️⃣ *Visit a Store:* ओरिजिनल आधार कार्ड और UPC लेकर किसी भी ऑफिशियल ऑपरेटर स्टोर या नज़दीकी मोबाइल शॉप जाएं और MNP करवा कर सिम लें।\n` +
        `4️⃣ *Number Activation:* ऑपरेटर की MNP टाइमलाइन के अनुसार (3 से 5 वर्किंग दिन) नंबर आपके नाम पर एक्टिवेट हो जाएगा! 🎉\n\n` +
        `🛡️ *One-Stop Solution:* किसी भी समस्या के लिए आपको ऑपरेटर केयर में कॉल करने की कोई आवश्यकता नहीं है, नंबरवाले ही आपका वन-स्टॉप सॉल्यूशन है! आप कैसा नंबर ढूंढ रहे हैं? मुझे बताइए! 😊`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 🙏 નંબરવાલેથી VIP નંબર એક્ટિવેટ કરવાની સંપૂર્ણ પ્રક્રિયા:\n\n` +
        `તમારો ખરીદેલ VIP મોબાઇલ નંબર ભારતમાં કોઈપણ ઓપરેટર (Jio, Airtel, Vi, BSNL) પર MNP દ્વારા એક્ટિવેટ કરી શકાય છે. MNP પ્રક્રિયા માટે Unique Porting Code (UPC) ફરજિયાત છે.\n\n` +
        `1️⃣ *Order Confirmation:* પેમેન્ટ કન્ફર્મ થતાં જ UPC જનરેશન શરૂ થાય છે.\n` +
        `2️⃣ *UPC Generation:* 24 કામકાજના કલાકોમાં SMS દ્વારા UPC મોકલવામાં આવે છે. એક્સપાયર થવાના 1 દિવસ પહેલા MNP રિક્વેસ્ટ સબમિટ કરો.\n` +
        `3️⃣ *Visit a Store:* ઓરિજિનલ આધાર કાર્ડ અને UPC લઈને કોઈપણ ઓપરેટર સ્ટોર અથવા મોબાઈલ શોપ પર જાઓ અને સિમ મેળવો.\n` +
        `4️⃣ *Number Activation:* 3 થી 5 દિવસમાં નંબર તમારા નામે શરૂ થઈ જશે! 🎉\n\n` +
        `🛡️ *One-Stop Solution:* ઓપરેટર કેરમાં ફોન કરવાની કોઈ જરૂર નથી, નંબરવાલે તમારો વન-સ્ટોપ સોલ્યુશન છે! તમારે કેવો નંબર જોઈએ છે? 😊`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 🙏 नंबरवाले वरून VIP नंबर ॲक्टिव्हेट करण्याची पायरी-दर-पायरी प्रक्रिया:\n\n` +
        `खरेदी केलेला VIP मोबाईल नंबर संपूर्ण भारतात कोणत्याही ऑपरेटरवर (Jio, Airtel, Vi, BSNL) MNP द्वारे ॲक्टिव्हेट करता येतो. MNP साठी Unique Porting Code (UPC) आवश्यक असतो.\n\n` +
        `1️⃣ *Order Confirmation:* पेमेंट कन्फर्म झाल्यावर UPC जनरेशन सुरू होते.\n` +
        `2️⃣ *UPC Generation:* 24 कामकाजाच्या तासांत SMS द्वारे UPC पाठवला जातो. एक्सपायर होण्याच्या किमान 1 दिवस आधी MNP रिक्वेस्ट सबमिट करा.\n` +
        `3️⃣ *Visit a Store:* मूळ आधार कार्ड आणि UPC घेऊन कोणत्याही ऑपरेटर स्टोअर किंवा स्थानिक मोबाईल दुकानात जाऊन सिम घ्या.\n` +
        `4️⃣ *Number Activation:* ऑपरेटरच्या नियमांनुसार (3 ते 5 कामकाजाचे दिवस) नंबर तुमच्या नावे सुरू होईल! 🎉\n\n` +
        `🛡️ *One-Stop Solution:* ऑपरेटर कस्टमर केअरला कॉल करण्याची गरज नाही, नंबरवाले हेच तुमचे वन-स्टॉप सोल्युशन आहे! तुम्हाला कसा नंबर हवा आहे? 😊`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 🙏 Numberwale se VIP number activate karne ka step-by-step process yeh raha:\n\n` +
        `Aapka purchased VIP mobile number MNP ke through poore India mein kisi bhi telecom operator (Jio, Airtel, Vi ya BSNL) par activate kiya ja sakta hai. MNP process ke liye Unique Porting Code (UPC) mandatory hota hai.\n\n` +
        `1️⃣ *Order Confirmation:* Payment confirm hote hi UPC generation process shuru ho jata hai.\n` +
        `2️⃣ *UPC Generation:* 24 working hours ke andar aapko SMS ke through UPC mil jata hai. Yeh limited period ke liye valid hota hai, isiliye expire hone se kam se kam 1 din pehle MNP request submit karein.\n` +
        `3️⃣ *Visit a Store:* Original Aadhaar Card aur UPC lekar kisi bhi official operator store ya local mobile shop par visit karein aur SIM receive karein.\n` +
        `4️⃣ *Number Activation:* Operator ke MNP timeline (3 to 5 business days) ke mutabik number aapke apne naam par activate ho jayega! 🎉\n\n` +
        `🛡️ *One-Stop Solution:* Kisi bhi dikkat par aapko operator customer care call karne ki bilkul zarurat nahi hai, Numberwale hi aapka One-Stop Solution hai! Aapko kaisa VIP number pasand hai? Batayein! 😊`;
    } else {
      return `Hello ${greeting}! 🙏 Here is the complete step-by-step activation process for your VIP mobile number:\n\n` +
        `Your purchased VIP mobile number can be activated with any telecom operator (Jio, Airtel, Vi or BSNL; BSNL subject to availability) anywhere in India through Mobile Number Portability (MNP). A Unique Porting Code (UPC) is mandatory to activate your VIP mobile number through the MNP process.\n\n` +
        `1️⃣ *Order Confirmation:* Once your payment is confirmed, the UPC generation process begins.\n` +
        `2️⃣ *UPC Generation:* The UPC will be shared with you via SMS within 24 working hours. The UPC is valid for a limited period, so please submit your MNP request at least 1 day before expiration.\n` +
        `3️⃣ *Visit a Store:* Carry your original Aadhaar Card and the UPC. Visit any official telecom operator store OR nearby local mobile store to complete the MNP request and collect your SIM. (For postpaid connections, please visit an official operator store).\n` +
        `4️⃣ *Number Activation:* The number will be activated as per the operator's standard MNP timeline (typically 3 to 5 business days nationwide).\n\n` +
        `🛡️ *One-Stop Solution:* If you encounter any issue during MNP, Numberwale is your one-stop solution. Contact us directly for a fresh UPC at zero cost or 100% money-back guarantee!\n\n` +
        `What kind of VIP number are you looking for today? 😊`;
    }
  }

  if (intentType === 'FAQ_NETWORK') {
    if (lang === 'Hindi') {
      return `नमस्ते ${greeting}! 📶 नंबरवाले के सभी VIP नंबर्स भारत के सभी प्रमुख नेटवर्क्स (Jio, Airtel, Vi, BSNL) पर 100% सपोर्ट करते हैं!\n\n` +
        `✅ 4G और 5G दोनों पर काम करेगा\n` +
        `✅ स्टोर पर आप प्रीपेड या पोस्टपेड कुछ भी चुन सकते हैं\n` +
        `✅ फिजिकल सिम एक्टिवेट होने के बाद आप इसे eSIM में भी बदल सकते हैं\n\n` +
        `आप किस ऑपरेटर में नंबर एक्टिवेट करना चाहते हैं? 😊`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 📶 નંબરવાલેના તમામ VIP નંબર્સ ભારતના તમામ મુખ્ય નેટવર્ક્સ (Jio, Airtel, Vi, BSNL) પર 100% કામ કરે છે!\n\n` +
        `✅ 4G અને 5G બંને પર ચાલશે\n` +
        `✅ સ્ટોર પર તમે પ્રીપેડ અથવા પોસ્ટપેડ પસંદ કરી શકો છો\n` +
        `✅ સિમ એક્ટિવેટ થયા પછી eSIM માં પણ કન્વર્ટ કરી શકાય છે\n\n` +
        `તમે કયા ઓપરેટરમાં નંબર શરૂ કરવા માંગો છો? 😊`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 📶 नंबरवाले चे सर्व VIP नंबर भारतातील सर्व प्रमुख नेटवर्क्स (Jio, Airtel, Vi, BSNL) वर 100% चालतात!\n\n` +
        `✅ 4G आणि 5G दोन्हीवर काम करेल\n` +
        `✅ स्टोअरमध्ये तुम्ही प्रीपेड किंवा पोस्टपेड काहीही निवडू शकता\n` +
        `✅ सिम ॲक्टिव्हेट झाल्यावर तुम्ही ते eSIM मध्येही बदलू शकता\n\n` +
        `तुम्हाला कोणत्या ऑपरेटरमध्ये नंबर सुरू करायचा आहे? 😊`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 📶 Numberwale ke sabhi VIP numbers sabhi major networks (Jio, Airtel, Vi, BSNL) par 100% work karte hain!\n\n` +
        `✅ 4G & 5G dono par smoothly chalega\n` +
        `✅ Store par aap Prepaid ya Postpaid koi bhi option choose kar sakte hain\n` +
        `✅ Physical SIM activate hone ke baad ise eSIM mein bhi convert kar sakte hain\n\n` +
        `Aap kis operator ke saath number chalana chahte hain? 😊`;
    } else {
      return `Hello ${greeting}! 📶 All VIP numbers from Numberwale work seamlessly across all major Indian operators (Jio, Airtel, Vi, BSNL)!\n\n` +
        `✅ 100% Compatible with both 4G & 5G devices\n` +
        `✅ Choose Prepaid or Postpaid at the operator store\n` +
        `✅ Easily convertible to eSIM once activated\n\n` +
        `Which operator network do you prefer? 😊`;
    }
  }

  if (intentType === 'FAQ_PRICING') {
    if (lang === 'Hindi') {
      return `नमस्ते ${greeting}! 💰 हमारी वेबसाइट पर सभी VIP नंबर्स पर पहले से ही 50% तक का डिस्काउंट और 18% GST बिल शामिल है।\n\n` +
        `चूँकि UPC कोड 24 घंटे में डिजिटल डिलीवर होता है, इसलिए COD उपलब्ध नहीं है। ऑनलाइन पेमेंट 100% सुरक्षित है (UPI, Cards, Netbanking, EMI)।\n\n` +
        `👉 यदि आप कोई प्रीमियम या बल्क नंबर ले रहे हैं, तो मैं हमारे सीनियर मैनेजर से स्पेशल डील के लिए कनेक्ट करवा सकता हूँ। क्या आप कनेक्ट करना चाहेंगे? 😊`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 💰 અમારી વેબસાઇટ પર તમામ VIP નંબરો પર પહેલેથી જ 50% સુધીનું ડિસ્કાઉન્ટ અને 18% GST બિલ શામેલ છે.\n\n` +
        `UPC કોડ 24 કલાકમાં ડિજિટલી મળતો હોવાથી COD ઉપલબ્ધ નથી. ઓનલાઇન પેમેન્ટ 100% સુરક્ષિત છે (UPI, Cards, Netbanking, EMI).\n\n` +
        `👉 જો તમે પ્રીમિયમ અથવા બલ્ક નંબર શોધી રહ્યા છો, તો હું અમારા સિનિયર મેનેજર સાથે સ્પેશિયલ ડીલ માટે કનેક્ટ કરાવી શકું છું. 😊`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 💰 आमच्या वेबसाइटवर सर्व VIP नंबरवर आधीच 50% पर्यंत सूट आणि 18% GST बिल समाविष्ट आहे.\n\n` +
        `UPC कोड 24 तासांत डिजिटल दिला जात असल्याने COD उपलब्ध नाही. ऑनलाइन पेमेंट 100% सुरक्षित आहे (UPI, Cards, Netbanking, EMI).\n\n` +
        `👉 जर आपण प्रीमियम किंवा बल्क नंबर घेत असाल, तर मी आमच्या वरिष्ठ मॅनेजरशी खास ऑफरसाठी कनेक्ट करू शकतो. 😊`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 💰 Hamari website par sabhi VIP numbers par already up to 50% discount aur 18% official GST invoice included hai.\n\n` +
        `Kyunki UPC code 24 hours mein digitally deliver hota hai, isiliye COD possible nahi hai. Online payments 100% secure hain (UPI, Cards, Net Banking, EMI).\n\n` +
        `👉 Agar aap koi high-value premium number dekh rahe hain, toh main exclusive deal ke liye senior manager se connect karwa sakta hun. Connect karein? 😊`;
    } else {
      return `Hello ${greeting}! 💰 All prices listed on Numberwale already include up to 50% discount and full 18% GST invoice.\n\n` +
        `Because the UPC code is delivered digitally within 24 hours, COD is not possible. Payments are 100% secure via UPI, Cards, Net Banking, and Credit Card EMI.\n\n` +
        `👉 If you are looking at a premium VVIP number, I can connect you to our senior manager for an exclusive deal. Would you like me to connect you? 😊`;
    }
  }

  if (intentType === 'FAQ_TRUST') {
    if (lang === 'Hindi') {
      return `नमस्ते ${greeting}! 🌟 नंबरवाले 2010 से (10+ साल) भारत की सबसे भरोसेमंद VIP नंबर कंपनी है:\n\n` +
        `✅ 1 लाख+ संतुष्ट ग्राहक पूरे भारत में\n` +
        `✅ TRAI नियमों के तहत 100% कानूनी MNP प्रक्रिया\n` +
        `✅ हर खरीद पर पक्का GST इनवॉइस\n` +
        `✅ 100% Money Back Guarantee (यदि पोर्टिंग में कोई समस्या आए)\n` +
        `📍 मुख्य कार्यालय: भयंदर ईस्ट, ठाणे / मुंबई, महाराष्ट्र (हेल्पलाइन: 9222 222 007)\n\n` +
        `आप निश्चिंत होकर अपना पसंदीदा नंबर चुन सकते हैं! कैसा नंबर पसंद करेंगे? 😊`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 🌟 નંબરવાલે 2010 થી (10+ વર્ષ) ભારતની સૌથી વિશ્વસનીય VIP નંબર કંપની છે:\n\n` +
        `✅ 1 લાખથી વધુ સંતુષ્ટ ગ્રાહકો\n` +
        `✅ TRAI નિયમો હેઠળ 100% કાનૂની MNP પ્રક્રિયા\n` +
        `✅ દરેક ખરીદી પર પાકું GST બિલ\n` +
        `✅ 100% Money Back Guarantee\n` +
        `📍 મુખ્ય કાર્યાલય: ભાયંદર ઇસ્ટ, થાણે / મુંબઈ, મહારાષ્ટ્ર (હેલ્પલાઇન: 9222 222 007)\n\n` +
        `તમે સંપૂર્ણ વિશ્વાસ સાથે ખરીદી શકો છો! કેવો નંબર જોવો છે? 😊`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 🌟 नंबरवाले 2010 पासून (10+ वर्षे) भारतातील सर्वात विश्वासार्ह VIP नंबर कंपनी आहे:\n\n` +
        `✅ 1 लाख+ समाधानी ग्राहक\n` +
        `✅ TRAI नियमांनुसार 100% कायदेशीर MNP प्रक्रिया\n` +
        `✅ प्रत्येक खरेदीवर पक्के GST बिल\n` +
        `✅ 100% Money Back Guarantee\n` +
        `📍 मुख्य कार्यालय: भाईंदर पूर्व, ठाणे / मुंबई, महाराष्ट्र (हेल्पलाइन: 9222 222 007)\n\n` +
        `तुम्ही पूर्ण विश्वासाने खरेदी करू शकता! कसा नंबर पाहायचा आहे? 😊`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 🌟 Numberwale 2010 se (10+ years) India ki #1 most trusted VIP number company hai:\n\n` +
        `✅ 1 Lakh+ Happy Customers all over India\n` +
        `✅ 100% Legal MNP process compliant with TRAI regulations\n` +
        `✅ Official GST invoice for every purchase\n` +
        `✅ 100% Money-Back Guarantee (agar porting mein koi issue aaye)\n` +
        `📍 Head Office: Bhayandar East, Thane / Mumbai, Maharashtra (Helpline: 9222 222 007)\n\n` +
        `Aap complete confidence ke saath number book kar sakte hain! Kaisa number dekhna chahenge? 😊`;
    } else {
      return `Hello ${greeting}! 🌟 Numberwale is India's most trusted VIP number provider with a 10+ year legacy (since 2010):\n\n` +
        `✅ 1 Lakh+ Happy Customers across India\n` +
        `✅ 100% Legal MNP process compliant with TRAI regulations\n` +
        `✅ Official GST invoice for every purchase\n` +
        `✅ 100% Money-Back Guarantee if activation encounters any technical issue\n` +
        `📍 Head Office: Bhayandar East, Thane / Mumbai, Maharashtra (Helpline: 9222 222 007)\n\n` +
        `You can buy with complete confidence! What kind of number would you like to see? 😊`;
    }
  }

  // Generic fallback
  if (lang === 'Hindi') {
    return `नमस्ते ${greeting}! 🙏 नंबरवाले 2010 से 1 लाख+ संतुष्ट ग्राहकों के साथ भारत की नंबर 1 VIP मोबाइल नंबर कंपनी है। आज मैं आपके लिए कैसा VIP नंबर ढूंढने में मदद करूँ? 😊`;
  } else if (lang === 'Gujarati') {
    return `નમસ્તે ${greeting}! 🙏 નંબરવાલે 2010 થી 1 લાખ+ ગ્રાહકો સાથે ભારતની નંબર 1 VIP મોબાઈલ નંબર કંપની છે. આજે હું તમારી કેવી રીતે મદદ કરી શકું? 😊`;
  } else if (lang === 'Marathi') {
    return `नमस्कार ${greeting}! 🙏 नंबरवाले 2010 पासून 1 लाख+ ग्राहकांसह भारतातील नंबर 1 VIP मोबाईल नंबर कंपनी आहे. मी आज तुम्हाला कसा VIP नंबर शोधण्यात मदत करू? 😊`;
  } else if (lang === 'Hinglish') {
    return `Namaste ${greeting}! 🙏 Numberwale 2010 se 1 Lakh+ happy clients ke saath India ki #1 VIP mobile number destination hai. Main aaj aapke liye kaisa VIP number dhundhne mein help karun? 😊`;
  } else {
    return `Hello ${greeting}! Numberwale has been India's #1 VIP mobile number destination since 2010 with 1 Lakh+ happy clients. How can I help you find your dream VIP number today? 😊`;
  }
}

/**
 * Handle Numerology advice and provide calculated recommendation
 */
export async function generateNumerologyReply({ numerologyData, customerContext }) {
  const lang = customerContext.language || 'English';
  const name = customerContext.name && customerContext.name !== 'Unknown' ? customerContext.name : '';
  const greeting = name ? `${name} ji` : '';

  // Case 1: Customer asked for birthday/numerology recommendation but has NOT provided their date of birth yet
  if (!numerologyData) {
    if (lang === 'Hindi') {
      return `नमस्ते ${greeting}! 🔮 अपने जन्मदिन (Birthday) के अनुसार सबसे भाग्यशाली VIP मोबाइल नंबर जानने के लिए कृपया अपनी जन्मतिथि (Date of Birth) लिखकर भेजें!\n\n` +
        `📅 *उदाहरण:* _15/08/1995_ या _24 August_ या _जन्म तारीख 24_\n\n` +
        `💡 हम आपकी जन्मतिथि से आपका *मूलांक (Driver Number)*, *भाग्यांक (Conductor Number)* और *स्वामी ग्रह* की गणना करके बताएंगे कि कौन सा नंबर आपके लिए शुभ है।\n\n` +
        `📊 *विस्तृत न्यूमरोलॉजी रिपोर्ट:* यदि आपको डिटेल में जानना है कि आपके नंबर में कौन सा अंक कितनी बार आना चाहिए (Favorable Frequency), कौन सा अंक बिल्कुल नहीं होना चाहिए (Enemy Digits), या अपने मौजूदा नंबर को जन्मतिथि से कम्पेयर करना है, तो आप हमारी वेबसाइट से रिपोर्ट भी निकाल सकते हैं:\n` +
        `🔗 https://www.numberwale.com/numerology`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 🔮 તમારા જન્મદિવસ (Birthday) મુજબ શ્રેષ્ઠ લકી VIP મોબાઈલ નંબર જાણવા માટે કૃપા કરીને તમારી જન્મતારીખ (Date of Birth) લખીને મોકલો!\n\n` +
        `📅 *ઉદાહરણ:* _15/08/1995_ અથવા _જન્મ તારીખ 24_\n\n` +
        `💡 અમે તમારી જન્મતારીખ પરથી તમારા *મૂળાંક (Driver Number)* અને *ભાગ્યાંક (Conductor Number)* ની ગણતરી કરી જણાવીશું કે કયો નંબર તમારા માટે શુભ છે.\n\n` +
        `📊 *સંપૂર્ણ ન્યૂમરોલોજી રિપોર્ટ:* કયો અંક કેટલી વાર હોવો જોઈએ અને કયો અંક ટાળવો જોઈએ તે વિગતવાર જાણવા અથવા તમારા હાલના નંબરને સરખાવવા માટે અમારી વેબસાઇટ પર રિપોર્ટ જુઓ:\n` +
        `🔗 https://www.numberwale.com/numerology`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 🔮 आपल्या वाढदिवसानुसार (Birthday) सर्वोत्तम लकी VIP मोबाईल नंबर जाणून घेण्यासाठी कृपया आपली जन्मतारीख (Date of Birth) टाईप करून पाठवा!\n\n` +
        `📅 *उदाहरण:* _15/08/1995_ किंवा _जन्मतारीख 24_\n\n` +
        `💡 आम्ही तुमच्या जन्मतारखेवरून तुमचा *मूलांक (Driver Number)* आणि *भाग्यांक (Conductor Number)* काढून कोणता नंबर तुमच्यासाठी भाग्यवान ठरेल ते सांगू.\n\n` +
        `📊 *सविस्तर न्यूमरोलॉजी रिपोर्ट:* तुमच्या नंबरमध्ये कोणता अंक किती वेळा असावा आणि कोणता अंक नसावा हे सविस्तर तपासण्यासाठी किंवा नंबर कम्पेअर करण्यासाठी आमच्या वेबसाइटला भेट द्या:\n` +
        `🔗 https://www.numberwale.com/numerology`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 🔮 Apne birthday ke according best lucky VIP mobile number janne ke liye kripya apni Date of Birth (DOB) likhkar bhejein!\n\n` +
        `📅 *Example:* _15/08/1995_ ya _birth date 24_\n\n` +
        `💡 Hum aapke birthday se aapka *Mulank (Driver Number)*, *Bhagyank (Conductor Number)* aur *Ruling Planet* calculate karke batayenge ki konsa number aapke liye sabse lucky rahega.\n\n` +
        `📊 *Detailed Numerology Report:* Agar aapko detail mein check karna hai ki aapke birthday ke hisaab se mobile number mein *konsa digit kitna frequent hona chahiye*, *konsa digit avoid karna chahiye*, ya apne existing number ko birthday se compare karna hai, toh aap hamari website se report nikal sakte hain:\n` +
        `🔗 https://www.numberwale.com/numerology`;
    } else {
      return `Hello ${greeting}! 🔮 To find your perfect lucky VIP mobile number based on your Birthday, please share your Date of Birth!\n\n` +
        `📅 *Example:* _15/08/1995_ or _Born on 24th_\n\n` +
        `💡 We will calculate your *Driver Number (Mulank)*, *Destiny Number (Bhagyank)*, and *Ruling Planet* to find numbers that align with your energy.\n\n` +
        `📊 *Detailed Numerology Report:* To find out which digits should appear frequently in your number, which digits to strictly avoid, or to compare your current number with your birth date, get your full report on our website:\n` +
        `🔗 https://www.numberwale.com/numerology`;
    }
  }

  // Case 2: Date of Birth is parsed and numerology calculated!
  const { day, month, year, mulank, bhagyank, planet, traits } = numerologyData;
  const dobString = month && year ? `${day}/${month}/${year}` : `Day ${day}`;
  const destinyText = bhagyank ? ` | भाग्यांक (Destiny): *${bhagyank}*` : '';
  const destinyTextEn = bhagyank ? ` | Destiny Number (Bhagyank): *${bhagyank}*` : '';
  const destinyTextHing = bhagyank ? ` | Bhagyank (Conductor): *${bhagyank}*` : '';

  if (lang === 'Hindi') {
    return `🌟 *न्यूमरोलॉजी विश्लेषण (${greeting})* 🌟\n\n` +
      `📅 *आपकी जन्म तिथि:* ${dobString}\n` +
      `🔢 *मूलांक (Driver Number):* *${mulank}*${destinyText}\n` +
      `🪐 *स्वामी ग्रह:* *${planet}*\n` +
      `✨ *ऊर्जा व प्रभाव:* *${traits}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *यह नंबर्स आपकी बर्थडे से क्यों मैच करते हैं?*\n` +
      `न्यूमरोलॉजी में हर जन्मतिथि का एक विशिष्ट कॉस्मिक वाइब्रेशन होता है। नीचे दिए गए नंबर्स का कुल योग (Single-Digit Sum Total) *${mulank}* बनता है, जो सीधे आपके स्वामी ग्रह *${planet}* की ऊर्जा से मेल खाता है। जब आपके मोबाइल नंबर का टोटल आपके मूलांक से संरेखित (align) होता है, तो यह करियर, व्यापार में धन लाभ, तरक्की और भाग्य को आकर्षित करता है तथा जीवन में सकारात्मक ऊर्जा लाता है!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *और डिटेल में न्यूमरोलॉजी रिपोर्ट चाहिए?*\n` +
      `यदि आप विस्तार से जानना चाहते हैं कि:\n` +
      `✅ आपकी जन्मतिथि के अनुसार मोबाइल नंबर में *कौन सा अंक कितनी बार आना चाहिए* (Favorable Frequency)\n` +
      `❌ *कौन सा अंक बिल्कुल नहीं होना चाहिए* (Enemy / Unfavorable Digits)\n` +
      `🔍 अपने *मौजूदा मोबाइल नंबर को जन्मतिथि से कम्पेयर* करके अनुकूलता स्कोर देखना चाहते हैं\n\n` +
      `👉 तो आप हमारी ऑफिशियल वेबसाइट से अपनी पूरी *Personalized Mobile Numerology Report* प्राप्त कर सकते हैं:\n` +
      `🔗 https://www.numberwale.com/numerology\n\n` +
      `👇 *आपके मूलांक ${mulank} से मैच करने वाले बेस्ट लकी VIP नंबर्स:*`;
  } else if (lang === 'Hinglish') {
    return `🌟 *Numerology Analysis (${greeting})* 🌟\n\n` +
      `📅 *Aapki Birth Date:* ${dobString}\n` +
      `🔢 *Mulank (Driver Number):* *${mulank}*${destinyTextHing}\n` +
      `🪐 *Ruling Planet:* *${planet}*\n` +
      `✨ *Energy & Vibration:* *${traits}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *Yeh numbers aapki birthday se kyu match karte hain?*\n` +
      `Numerology ke anusaar, aapki birth date ka ek powerful planetary vibration hota hai. Neeche diye gaye numbers ka Single-Digit Sum Total *${mulank}* hai, jo seedhe aapke ruling planet *${planet}* se resonate karta hai. Jab mobile number ka total aapke Mulank se align hota hai, toh yeh business deals, career growth aur personal life mein positive cosmic energy attract karta hai aur rukawaton ko door karta hai!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Aur Detail Mein Numerology Report Chahiye?*\n` +
      `Agar aapko deeply analyse karna hai ki:\n` +
      `✅ Birthday ke hisaab se mobile number mein *konsa digit kitna frequent (baar-baar) hona chahiye*\n` +
      `❌ *Konsa digit bilkul nahi hona chahiye* (avoid / enemy digits)\n` +
      `🔍 Apne *existing mobile number ko apni birth date se compare* karke compatibility check karni ho\n\n` +
      `👉 Toh aap hamari website se apni complete *Personalized Numerology Report* turant generate kar sakte hain:\n` +
      `🔗 https://www.numberwale.com/numerology\n\n` +
      `👇 *Aapke Mulank ${mulank} ke matching best lucky VIP numbers:*`;
  } else if (lang === 'Gujarati') {
    return `🌟 *ન્યૂમરોલોજી વિશ્લેષણ (${greeting})* 🌟\n\n` +
      `📅 *તમારી જન્મ તારીખ:* ${dobString}\n` +
      `🔢 *મૂળાંક (Driver Number):* *${mulank}*${bhagyank ? ` | ભાગ્યાંક: *${bhagyank}*` : ''}\n` +
      `🪐 *સ્વામી ગ્રહ:* *${planet}*\n` +
      `✨ *પ્રભાવ:* *${traits}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *આ નંબર્સ તમારી જન્મતારીખ સાથે કેમ મેળ ખાય છે?*\n` +
      `ન્યૂમરોલોજી અનુસાર, દરેક જન્મતારીખ એક વિશિષ્ટ ગ્રહની ઊર્જા સાથે જોડાયેલી હોય છે. નીચે આપેલા નંબરોનો કુલ સરવાળો (Single-Digit Sum Total) *${mulank}* બને છે, જે સીધા તમારા સ્વામી ગ્રહ *${planet}* સાથે જોડાય છે. જ્યારે મોબાઈલ નંબર તમારા મૂળાંક સાથે સંરેખિત થાય છે, ત્યારે તે વ્યવસાય અને જીવનમાં પ્રગતિ અને સકારાત્મક ભાગ્ય આકર્ષિત કરે છે!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *વધુ વિગતવાર ન્યૂમરોલોજી રિપોર્ટ જોઈએ છે?*\n` +
      `જો તમારે વિગતવાર જાણવું હોય કે:\n` +
      `✅ તમારી જન્મતારીખ મુજબ નંબરમાં *કયો અંક કેટલી વાર હોવો જોઈએ*\n` +
      `❌ *કયો અંક બિલકુલ ન હોવો જોઈએ* (વિરોધી અંક)\n` +
      `🔍 તમારા *હાલના નંબરને જન્મતારીખ સાથે સરખાવી* કમ્પેટીબિલિટી ચકાસવી હોય\n\n` +
      `👉 તો તમે અમારી વેબસાઇટ પરથી તમારી સંપૂર્ણ *Personalized Numerology Report* મેળવી શકો છો:\n` +
      `🔗 https://www.numberwale.com/numerology\n\n` +
      `👇 *તમારા મૂળાંક ${mulank} સાથે મેળ ખાતા શ્રેષ્ઠ VIP નંબર્સ:*`;
  } else if (lang === 'Marathi') {
    return `🌟 *न्यूमरोलॉजी विश्लेषण (${greeting})* 🌟\n\n` +
      `📅 *तुमची जन्मतारीख:* ${dobString}\n` +
      `🔢 *मूलांक (Driver Number):* *${mulank}*${bhagyank ? ` | भाग्यांक: *${bhagyank}*` : ''}\n` +
      `🪐 *स्वामी ग्रह:* *${planet}*\n` +
      `✨ *ऊर्जा व प्रभाव:* *${traits}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *हे नंबर तुमच्या वाढदिवसाशी का जुळतात?*\n` +
      `न्यूमरोलॉजीनुसार, प्रत्येकाच्या जन्मतारखेची एक वैश्विक ऊर्जा (Cosmic Vibration) असते. खालील नंबरची बेरीज (Single-Digit Sum Total) *${mulank}* होते, जी थेट तुमच्या स्वामी ग्रह *${planet}* च्या ऊर्जेशी जुळते. जेव्हा मोबाईल नंबरची बेरीज तुमच्या मूलांकाशी जुळते, तेव्हा ती करिअर आणि व्यवसायात सकारात्मक ऊर्जा, भरभराट आणि यश आकर्षित करते!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *अधिक सविस्तर न्यूमरोलॉजी रिपोर्ट हवा आहे का?*\n` +
      `जर तुम्हाला सविस्तर जाणून घ्यायचे असेल की:\n` +
      `✅ जन्मतारखेनुसार नंबरमध्ये *कोणता अंक किती वेळा असायला हवा*\n` +
      `❌ *कोणता अंक अजिबात नसावा* (शत्रू अंक)\n` +
      `🔍 तुमच्या *सध्याच्या नंबरची जन्मतारखेशी तुलना* करून स्कोअर तपासायचा असेल\n\n` +
      `👉 तर तुम्ही आमच्या वेबसाइटवरून तुमची संपूर्ण *Personalized Numerology Report* मिळवू शकता:\n` +
      `🔗 https://www.numberwale.com/numerology\n\n` +
      `👇 *तुमच्या मूलांक ${mulank} शी जुळणारे सर्वोत्तम लकी VIP नंबर:*`;
  } else {
    // English
    return `🌟 *Numerology Insights (${greeting})* 🌟\n\n` +
      `📅 *Date of Birth:* ${dobString}\n` +
      `🔢 *Driver Number (Mulank):* *${mulank}*${destinyTextEn}\n` +
      `🪐 *Ruling Planet:* *${planet}*\n` +
      `✨ *Cosmic Vibration:* *${traits}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *Why do these numbers match your birthday?*\n` +
      `In numerology, your birth date governs your personal frequency. The numbers shown below possess a Single-Digit Sum Total of *${mulank}*, perfectly harmonizing with your ruling planet *${planet}*. Aligning your mobile number's total with your Mulank activates favorable cosmic vibrations—attracting success in career and business, enhancing financial prosperity, and warding off negative obstacles!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Need a Detailed Numerology Analysis?*\n` +
      `If you want an in-depth report showing:\n` +
      `✅ Which digits *should appear frequently* in your number based on your birth chart & Lo Shu Grid\n` +
      `❌ Which digits *should be strictly avoided* (unfavorable/enemy digits)\n` +
      `🔍 *Comparing your current mobile number* with your birth date for compatibility scoring\n\n` +
      `👉 You can instantly generate your complete *Personalized Mobile Numerology Report* on our website:\n` +
      `🔗 https://www.numberwale.com/numerology\n\n` +
      `👇 *Top Lucky VIP Numbers matching your Mulank ${mulank}:*`;
  }
}

/**
 * Generate a friendly, charismatic greeting introducing Eva from Numberwale.
 */
export async function generateConversationalGreeting({ lang = 'Hinglish', name = '', history = [] }) {
  const greeting = name && name !== 'Unknown' ? `${name} ji` : '';

  const systemPrompt = `You are Eva, Senior VIP Mobile Number Consultant at Numberwale (India's #1 VIP phone number destination since 2010, 10+ years legacy, 1 Lakh+ happy clients across India). You have an elegant, warm, charming female personality (ladki ki personality).
CRITICAL FEMALE GRAMMAR RULE (HINDI / HINGLISH / MARATHI): Always use natural female grammatical verb endings for yourself! Use "karti hoon" (never "karta hoon"), "bataungi" / "bata sakti hoon" (never "bataunga"), "dekh sakti hoon", "madad kar sakti hoon" (never "kar sakta hoon"), "nikal ke deti hoon" (never "deta hun").
The customer has greeted you on WhatsApp.
Respond warmly, respectfully, and enthusiastically STRICTLY in ${lang}. DO NOT mix languages or append words from other languages.
Introduce yourself with: "Hi, I'm Eva, Numberwale's assistant! 😊" (in Hinglish: "Hi! Main Eva, Numberwale ki assistant! 😊" / in Hindi: "नमस्ते! मैं Eva, Numberwale की assistant! 😊").
Ask what kind of prestigious VIP number they have in mind today:
- Lucky birthdate / numerology match
- Royal repeating sequences (e.g. 9999, 786, 0007)
- Corporate/business branding or mirror numbers
Encourage them to tell you their favorite digits, pattern, or budget.
Keep it punchy (3-4 sentences), charismatic, with polite conversational flair and emojis.`;

  try {
    const aiText = await runLocalAgentChat({
      systemPrompt,
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.35,
      maxTokens: 250
    });
    if (aiText && aiText.length > 25) {
      return aiText;
    }
  } catch (e) {
    console.log(`[AgentEngine] 🔄 Greeting LLM fallback (${e.message})`);
  }

  // Pre-crafted instant charismatic greeting
  if (lang === 'Hindi') {
    return `नमस्ते ${greeting || 'जी'}! 🙏 Hi, मैं Eva, Numberwale की assistant। 😊\n\n` +
      `2010 से हमने 1 लाख से अधिक संतुष्ट ग्राहकों को उनके सपनों का VIP मोबाइल नंबर दिलाया है! ✨\n\n` +
      `आज आप कैसा नंबर ढूंढ रहे हैं?\n` +
      `🌟 बर्थडे / न्यूमरोलॉजी से मैच करता लकी नंबर\n` +
      `👑 रॉयल रिपीटिंग नंबर्स (जैसे 9999, 0007, 786)\n` +
      `💼 बिज़नेस ब्रांडिंग या मिरर पैटर्न्स?\n\n` +
      `आप अपना पसंदीदा डिजिट या बजट बताइए, मैं बेस्ट ऑप्शंस दिखाती हूँ! 😊`;
  } else if (lang === 'Gujarati') {
    return `નમસ્તે ${greeting || 'જી'}! 🙏 Hi, હું Eva, Numberwale ની assistant. 😊\n\n` +
      `2010 થી અમે 1 લાખથી વધુ ખુશ ગ્રાહકોને શ્રેષ્ઠ VIP નંબર આપ્યા છે! ✨\n\n` +
      `આજે તમે કેવો નંબર શોધી રહ્યા છો?\n` +
      `🌟 જન્મતારીખ / ન્યૂમરોલોજી મુજબ લકી નંબર\n` +
      `👑 રોયલ રિપીટિંગ પેટર્ન (દા.ત. 9999, 786, 0007)\n` +
      `💼 બિઝનેસ બ્રાન્ડિંગ કે મિરર નંબર?\n\n` +
      `તમારો મનપસંદ આંકડો કે બજેટ જણાવો, હું બેસ્ટ નંબર્સ બતાવું! 😊`;
  } else if (lang === 'Marathi') {
    return `नमस्कार ${greeting || 'जी'}! 🙏 Hi, मी Eva, Numberwale ची assistant. 😊\n\n` +
      `2010 पासून आम्ही 1 लाखाहून अधिक समाधानी ग्राहकांना त्यांचे आवडते VIP नंबर दिले आहेत! ✨\n\n` +
      `आज तुम्ही कसा नंबर शोधत आहात?\n` +
      `🌟 जन्मतारीख / न्यूमरोलॉजी जुळणारा लकी नंबर\n` +
      `👑 रॉयल पॅटर्न (उदा. 9999, 786, 0007)\n` +
      `💼 बिज़नेस ब्रँडिंग किंवा मिरर नंबर?\n\n` +
      `तुमचा आवडता अंक किंवा बजेट सांगा, मी सर्वोत्तम पर्याय शोधून देते! 😊`;
  } else if (lang === 'English') {
    return `Hello ${greeting || 'there'}! 👋 Hi, I'm Eva, Numberwale's assistant! 😊\n\n` +
      `Since 2010, we've helped over 100,000+ happy clients secure their ideal VIP & fancy mobile numbers! ✨\n\n` +
      `What kind of prestigious number are you looking for today?\n` +
      `🌟 Lucky birthdate / numerology match\n` +
      `👑 Royal repeating sequence (like 9999, 786, 0007)\n` +
      `💼 Corporate branding or mirror patterns?\n\n` +
      `Tell me your favorite digits or budget, and I'll fetch the best options for you! 😊`;
  } else {
    // Hinglish
    return `Namaste ${greeting || 'ji'}! 👋 Hi, I'm Eva, Numberwale's assistant! 😊\n\n` +
      `2010 se humne 1 Lakh+ happy clients ko unka dream VIP mobile number provide kiya hai! ✨\n\n` +
      `Aaj aap kaisa prestigious number dekhna chahte hain?\n` +
      `🌟 Lucky Birthdate / Numerology match\n` +
      `👑 Royal repeating patterns (jaise 9999, 786, 0007)\n` +
      `💼 Business branding ya Mirror patterns?\n\n` +
      `Apna favourite digit ya budget batayein, main best options nikal ke deti hoon! 😊`;
  }
}

/**
 * Consultative AI Salesperson (ChatGPT-style) that actively pitches and sells VIP numbers
 */
export async function generateSalesConsultantChat({
  userMessage,
  customerContext = {},
  history = [],
  sampleProducts = []
}) {
  const lang = customerContext.language || 'Hinglish';
  const name = customerContext.name && customerContext.name !== 'Unknown' ? customerContext.name : '';
  const greeting = name ? `${name} ji` : '';

  // Prepare short sample numbers list
  const sampleList = (sampleProducts || []).slice(0, 3).map((p, idx) => {
    const raw = p.productMobileNumber || '';
    const formatted = formatNumberBeauty(raw, p);
    const subtotal = p.pricing?.nwFinalPrice || p.price || 0;
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;
    const cat = p.category?.name || 'VIP Fancy Number';
    const sum = p.score ?? null;
    return `${idx + 1}️⃣ *${formatted}* 👑 (${cat})\n   💰 *₹${total.toLocaleString('en-IN')}* (Total with 18% GST & Bill)${sum !== null ? ` | Lucky Sum: ${sum}` : ''}\n   👉 Book: _buy ${raw}_`;
  }).join('\n\n');

  const systemPrompt = `You are Eva, Senior VIP Mobile Number Consultant at Numberwale (India's premier VIP phone number destination since 2010, 10+ years legacy, 1 Lakh+ happy clients across India). You have an elegant, charismatic female personality (ladki ki personality).
CRITICAL FEMALE GRAMMAR: Always use female verb forms for yourself in Hindi/Hinglish/Marathi ("karti hoon", "bataungi", "kar sakti hoon", "deti hoon" — NEVER "karta hoon" / "deta hun").
You are consulting a customer on WhatsApp.

YOUR SOLE MISSION:
Talk like an elite, consultative luxury sales consultant. Make the customer excited about owning a prestigious VIP mobile number and actively SELL numbers from Numberwale!

SALES RULES & BEHAVIOR:
1. STRICT LANGUAGE RULE: You must respond PURELY and STRICTLY in ${lang}. DO NOT mix languages. DO NOT append Hindi words if the language is English. Never output gibberish. Address the customer politely as "${greeting || 'ji'}".
2. TONE: Warm, charismatic, highly persuasive, and confident. Never sound like a robotic bot or menu machine.
3. CONVERSATIONAL AGILITY: Handle conversational phrases naturally. Always take charge of the conversation with sales enthusiasm!
4. THE PITCH (Why VIP numbers matter):
   - For Business: Instantly builds credibility, 10x recall by clients, makes your brand look established and trustworthy.
   - For Personal / Status: Makes an unforgettable impression on calls, WhatsApp, and Truecaller.
   - For Luck & Numerology: Aligns with your birth date / ruling planet to attract prosperity and remove obstacles.
5. RECOMMEND 3 WINNING CATEGORIES:
   - 👑 Royal Repeaters (9999, 786, 0007)
   - 💎 Mirror & Symmetry (9820 9820, 123 123 - easy to memorize)
   - 🔮 Lucky Numerology Totals (Single-digit sum 5 for Business or 6 for Luxury)
6. INVENTORY SAMPLES (Showcase these live numbers if available):
${sampleList || 'We have 45,000+ verified numbers starting from ₹2,500 to exclusive VVIP gems.'}
7. CLOSING DISCOVERY QUESTIONS:
   Always end with 1-2 sharp, friendly discovery questions in the requested language (${lang}):
   - (If English): "Are you looking for a number for business or personal use?", "Do you have any favorite digits or an approximate budget in mind?"
   - (If Hindi/Hinglish): "Aap yeh number apne business ke liye soch rahe hain ya personal use ke liye?", "Aapka koi favourite digit ya approximate budget range mind mein hai?"
8. TRAI ASSURANCES: 100% legal MNP process, 24-hr digital UPC code delivery, nearest operator store biometric KYC, 100% Money-Back Guarantee, official 18% GST tax invoice.

Keep the response engaging (3-5 crisp paragraphs), use emojis, bullet points, and WhatsApp formatting (*bold*). Never use markdown code blocks. NO GIBBERISH. NO REPEATING TEXT.`;

  try {
    const chatMessages = [
      ...history.slice(-4).map(h => ({
        role: h.role === 'bot' ? 'assistant' : 'user',
        content: h.text
      })),
      { role: 'user', content: userMessage }
    ];

    const aiText = await runLocalAgentChat({
      systemPrompt,
      messages: chatMessages,
      temperature: 0.35,
      maxTokens: 450
    });

    if (aiText && aiText.length > 50) {
      return aiText;
    }
  } catch (err) {
    console.log(`[AgentEngine] 🔄 LLM sales consultant chat fallback active (${err.message})`);
  }

  // Pre-crafted instant charismatic sales consultant fallback
  let sampleBlock = '';
  if (sampleList && sampleList.length > 0) {
    sampleBlock = `\n\n👇 *Hamare kuch top trending VIP numbers:*\n\n${sampleList}\n`;
  }

  if (lang === 'Hindi') {
    return `नमस्ते ${greeting || 'जी'}! 🌟 VIP मोबाइल नंबर सिर्फ एक नंबर नहीं, बल्कि आपकी 24/7 चलने वाली पहचान और ब्रांड वैल्यू है!\n\n` +
      `जब आप किसी क्लाइंट या साथी को कॉल करते हैं, तो एक रॉयल VIP नंबर तुरंत विश्वसनीयता और क्लास दर्शाता है। 👑\n\n` +
      `💡 *नंबर चुनने के 3 सबसे लोकप्रिय तरीके:*\n` +
      `1️⃣ *रॉयल रिपीटिंग नंबर्स:* 9999, 786, 0007 (तुरंत याद रहने वाले)\n` +
      `2️⃣ *मिरर व सिमिट्री:* 9820 9820 या 123 123 (बिज़नेस कार्ड्स के लिए बेस्ट)\n` +
      `3️⃣ *न्यूमरोलॉजी लकी टोटल:* कुल योग 5 (व्यापार वृद्धि) या 6 (वैभव और समृद्धि)\n` +
      sampleBlock + `\n` +
      `👉 *मुझे बस 2 बातें बताइए, मैं आपके लिए सबसे बेस्ट नंबर निकालता हूँ:*\n` +
      `1. आप यह नंबर अपने *बिज़नेस* के लिए देख रहे हैं या *पर्सनल* उपयोग के लिए?\n` +
      `2. आपका कोई *पसंदीदा अंक* (जैसे 9, 7, 5, 8) या *बजट* क्या है? 😊`;
  } else if (lang === 'Gujarati') {
    return `નમસ્તે ${greeting || 'જી'}! 🌟 VIP મોબાઈલ નંબર માત્ર એક નંબર નથી, પણ તમારી બ્રાન્ડ વેલ્યુ અને ઓળખ છે!\n\n` +
      `જ્યારે તમે કોઈ ક્લાયન્ટને કોલ કરો છો, ત્યારે VIP નંબર તરત જ પ્રીમિયમ સ્ટેટસ ઊભું કરે છે. 👑\n\n` +
      `💡 *શ્રેષ્ઠ 3 વિકલ્પો:*\n` +
      `1️⃣ *રોયલ રિપીટિંગ:* 9999, 786, 0007\n` +
      `2️⃣ *મિરર અને સિમેટ્રી:* 9820 9820 કે 123 123\n` +
      `3️⃣ *લકી ન્યૂમરોલોજી સમ:* સરવાળો 5 (વેપાર માટે) કે 6 (લક્ઝરી માટે)\n` +
      sampleBlock + `\n` +
      `👉 *મને ફક્ત 2 વિગતો જણાવો:*\n` +
      `1. તમે આ નંબર *બિઝનેસ* માટે શોધી રહ્યા છો કે *પર્સનલ*?\n` +
      `2. તમારો કોઈ *મનપસંદ આંકડો* કે *બજેટ* શું છે? 😊`;
  } else if (lang === 'Marathi') {
    return `नमस्कार ${greeting || 'जी'}! 🌟 VIP मोबाईल नंबर केवळ एक नंबर नसून तुमची प्रतिष्ठा आणि ब्रँड व्हॅल्यू आहे!\n\n` +
      `जेव्हा तुम्ही एखाद्या क्लायंटला कॉल करता, तेव्हा VIP नंबर लगेचच विश्वास आणि दर्जा दाखवतो. 👑\n\n` +
      `💡 *नंबर निवडण्यासाठी 3 सर्वोत्तम पर्याय:*\n` +
      `1️⃣ *रॉयल रिपीटिंग:* 9999, 786, 0007 (लगेच लक्षात राहणारे)\n` +
      `2️⃣ *मिरर व सममिती:* 9820 9820 किंवा 123 123 (बिझनेससाठी बेस्ट)\n` +
      `3️⃣ *न्यूमरोलॉजी लकी टोटल:* बेरीज 5 (व्यवसाय वृद्धी) किंवा 6 (समृद्धी)\n` +
      sampleBlock + `\n` +
      `👉 *मला फक्त 2 गोष्टी सांगा:*\n` +
      `1. हा नंबर तुम्ही *व्यवसायासाठी* पाहत आहात की *पर्सनल* वापरासाठी?\n` +
      `2. तुमचा कोणताही *आवडता अंक* किंवा *बजेट* काय आहे? 😊`;
  } else if (lang === 'English') {
    return `Hello ${greeting || 'there'}! 🌟 A VIP mobile number is far more than just 10 digits—it is your 24/7 personal brand and trust accelerator!\n\n` +
      `Whenever you call a client, investor, or partner, a prestigious VIP number instantly establishes credibility and elite status. 👑\n\n` +
      `💡 *3 Top Directions to Consider:*\n` +
      `1️⃣ *Royal Repeaters:* 9999, 786, or 0007 (Unforgettable recall)\n` +
      `2️⃣ *Mirror & Symmetry:* 9820 9820 or 123 123 (Clean corporate elegance)\n` +
      `3️⃣ *Lucky Numerology Sum:* Total 5 (Mercury/Business Growth) or 6 (Venus/Wealth)\n` +
      sampleBlock + `\n` +
      `👉 *Tell me just 2 things, and I will find your ideal number:*\n` +
      `1. Are you looking for *Business branding* or *Personal use*?\n` +
      `2. Do you have any *favorite digits* (e.g. 7, 9, 8) or an approximate *budget*? 😊`;
  } else {
    // Hinglish
    return `Zabardast ${greeting || 'ji'}! 🌟 VIP mobile number sirf ek contact number nahi, balki aapka 24/7 personal aur business brand ambassador hota hai!\n\n` +
      `Jab aap kisi client ya partner ko call karte hain, toh ek royal VIP number turant trust aur premium impression create karta hai. 👑\n\n` +
      `💡 *VIP number lene ke 3 sabse popular tareeqe:*\n` +
      `1️⃣ *Royal Repeating Kings:* Jaise 9999, 786, ya 0007 ending (Sabhi ko turant yaad rehta hai)\n` +
      `2️⃣ *Mirror & Symmetry:* Jaise 9820 9820 ya 123 123 (Corporate visiting cards ke liye perfect)\n` +
      `3️⃣ *Astrology / Lucky Total:* Single-digit sum 5 (Business Growth) ya 6 (Luxury & Wealth)\n` +
      sampleBlock + `\n` +
      `👉 *Mujhe bas 2 chizein batayein, main aapke liye best VIP number shortlist karta hun:*\n` +
      `1. Aap yeh number apne *Business* ke liye dekh rahe hain ya *Personal* use ke liye?\n` +
      `2. Aapka koi *favourite digit* (e.g. 9, 7, 5, 8) ya *budget range* kya soch rahe hain? 😊`;
  }
}

/**
 * Format search results conversationally as a charismatic sales consultant.
 */
export function formatConversationalSearchResults({
  products,
  totalCount,
  currentPage,
  totalPages,
  lang = 'Hinglish',
  customerName = '',
  userQuery = '',
  numerologyData = null
}) {
  const nameSalutation = customerName && customerName !== 'Unknown' ? `${customerName} ji` : '';

  if (!products || products.length === 0) {
    if (lang === 'Hindi') {
      return `माफ़ कीजिये ${nameSalutation}! 😔 आपकी इस खोज से मेल खाते नंबर्स अभी उपलब्ध नहीं हैं।\n\n💡 आप कोई दूसरा पैटर्न ट्राई कर सकते हैं (जैसे _req 786_, _mirror numbers_, या _ending 9999_)। अपना बजट या पसंदीदा अंक बताइए, मैं बेस्ट ऑप्शंस दिखाती हूँ! 😊`;
    } else if (lang === 'Gujarati') {
      return `માફ કરશો ${nameSalutation}! 😔 તમારી શોધ સાથે મેળ ખાતા નંબર્સ હાલ ઉપલબ્ધ નથી.\n\n💡 તમે અન્ય પેટર્ન અજમાવી શકો છો (દા.ત. _req 786_ અથવા _mirror numbers_). તમારું બજેટ જણાવો! 😊`;
    } else if (lang === 'Marathi') {
      return `क्षमस्व ${nameSalutation}! 😔 या शोधाशी जुळणारे नंबर सध्या उपलब्ध नाहीत.\n\n💡 तुम्ही दुसरा पॅटर्न वापरून पाहू शकता (उदा. _req 786_ किंवा _mirror numbers_). बजेट सांगा, मी मदत करते! 😊`;
    } else if (lang === 'English') {
      return `Oops ${nameSalutation}! 😔 No numbers matching this exact search are currently available.\n\n💡 Try popular patterns like _req 786_, _mirror numbers_, or _ending 9999_. Tell me your budget or preferred digits! 😊`;
    } else {
      return `Oops ${nameSalutation}! 😔 Is search se match karte hue numbers abhi available nahi hain.\n\n💡 Aap koi dusra pattern try kar sakte hain (jaise _req 786_, _mirror numbers_, ya _ending 9999_). Apna favourite digit ya budget batayein, main best options nikalti hoon! 😊`;
    }
  }

  let header = '';
  if (lang === 'Hindi') {
    header = `🌟 *शानदार चुनाव ${nameSalutation}!* आपके लिए हमारी VIP इन्वेंटरी से *${totalCount} प्रीमियम नंबर्स* मिले हैं (पेज ${currentPage}/${totalPages}):\n\n`;
  } else if (lang === 'Gujarati') {
    header = `🌟 *શ્રેષ્ઠ પસંદગી ${nameSalutation}!* તમારી પસંદગી મુજબ *${totalCount} પ્રીમિયમ VIP નંબર્સ* મળ્યા છે (પેજ ${currentPage}/${totalPages}):\n\n`;
  } else if (lang === 'Marathi') {
    header = `🌟 *उत्कृष्ट निवड ${nameSalutation}!* तुमच्यासाठी आमच्या इन्व्हेंटरीमधून *${totalCount} प्रीमियम VIP नंबर* उपलब्ध आहेत (पान ${currentPage}/${totalPages}):\n\n`;
  } else if (lang === 'English') {
    header = `🌟 *Great choice ${nameSalutation}!* Here are *${totalCount} hand-picked VIP numbers* for you (Page ${currentPage}/${totalPages}):\n\n`;
  } else {
    header = `🌟 *Great choice ${nameSalutation}!* Maine aapke liye hamari inventory se *${totalCount} premium VIP numbers* nikale hain (Page ${currentPage}/${totalPages}):\n\n`;
  }

  let body = header;

  products.forEach((p, idx) => {
    const rawNumber = p.productMobileNumber || 'N/A';
    const formattedNum = formatNumberBeauty(rawNumber, p);
    const subtotal = p.pricing?.nwFinalPrice || p.price || null;
    const basePrice = p.pricing?.nwBasePrice?.inr || null;
    const myDiscount = p.pricing?.nwMyDiscount || 0;
    const vendorDiscount = p.vendor?.vendorDiscount || 0;
    const effDiscount = myDiscount !== 0 ? myDiscount : vendorDiscount;
    const catName = p.category?.name || 'VIP Fancy Number';
    const sumScore = p.score ?? null;

    body += `${idx + 1}️⃣ *${formattedNum}* 👑\n`;
    body += `   📁 *Pattern:* ${catName}\n`;

    if (subtotal) {
      const gst = Math.round(subtotal * 0.18);
      const total = subtotal + gst;

      if (effDiscount > 0 && basePrice) {
        body += `   💰 ~₹${basePrice.toLocaleString('en-IN')}~ *₹${total.toLocaleString('en-IN')}* (${effDiscount}% OFF, Incl. 18% GST)\n`;
      } else {
        body += `   💰 *₹${total.toLocaleString('en-IN')}* (Total with 18% GST & Bill)\n`;
      }
    }

    if (sumScore !== null) {
      body += `   🔮 *Lucky Sum (Total):* ${sumScore}\n`;
    }

    body += `   👉 *Book instantly:* _buy ${rawNumber}_\n\n`;
  });

  body += `━━━━━━━━━━━━━━━━━━━━━\n`;

  // Engaging Closing Question & Options
  if (lang === 'Hindi') {
    body += `👉 *इनमें से आपको कौन सा नंबर सबसे शक्तिशाली और रॉयल लगा?*\n\n` +
      `🛒 *बुक करने के लिए तुरंत लिखें:*\n_buy ${products[0]?.productMobileNumber}_\n\n` +
      (currentPage < totalPages ? `🔹 अगले पेज के लिए *"more"* रिप्लाई करें\n` : '') +
      `🔹 नई खोज के लिए *"reset"* रिप्लाई करें\n` +
      `🔹 बात करने के लिए *"agent"* रिप्लाई करें 😊`;
  } else if (lang === 'Gujarati') {
    body += `👉 *આમાંથી તમને કયો નંબર સૌથી સારો અને પાવરફુલ લાગ્યો?*\n\n` +
      `🛒 *બુક કરવા માટે લખો:*\n_buy ${products[0]?.productMobileNumber}_\n\n` +
      (currentPage < totalPages ? `🔹 વધુ નંબર માટે *"more"* લખો\n` : '') +
      `🔹 નવી શોધ માટે *"reset"* લખો\n` +
      `🔹 વાત કરવા *"agent"* લખો 😊`;
  } else if (lang === 'Marathi') {
    body += `👉 *यातला कोणता नंबर तुम्हाला सर्वात जास्त आवडला?*\n\n` +
      `🛒 *बुक करण्यासाठी टाईप करा:*\n_buy ${products[0]?.productMobileNumber}_\n\n` +
      (currentPage < totalPages ? `🔹 पुढील पेजसाठी *"more"* लिहा\n` : '') +
      `🔹 नवीन शोधासाठी *"reset"* लिहा\n` +
      `🔹 बोलण्यासाठी *"agent"* लिहा 😊`;
  } else if (lang === 'English') {
    body += `👉 *Which of these numbers feels most impactful to you?*\n\n` +
      `🛒 *To book right away, reply:*\n_buy ${products[0]?.productMobileNumber}_\n\n` +
      (currentPage < totalPages ? `🔹 Reply *"more"* for next page\n` : '') +
      `🔹 Reply *"reset"* for a new search\n` +
      `🔹 Reply *"agent"* to speak with our manager 😊`;
  } else {
    // Hinglish
    body += `👉 *Aapko inme se konsa number sabse impactful aur royal lag raha hai?*\n\n` +
      `🛒 *Book karne ke liye simply type karein:*\n_buy ${products[0]?.productMobileNumber}_\n\n` +
      (currentPage < totalPages ? `🔹 Aur dekhne ke liye *"more"* reply karein\n` : '') +
      `🔹 Nayi search ke liye *"reset"* reply karein\n` +
      `🔹 Baat karne ke liye *"agent"* reply karein 😊`;
  }

  return body;
}

/**
 * Autonomous AI Sales Agent: Consultative Response Generator
 */
export async function generateSalesAgentResponse({
  userMessage,
  customerContext = {},
  history = [],
  intent = { type: 'SEARCH' },
  numerologyData = null,
  products = [],
  totalCount = 0,
  currentPage = 1,
  totalPages = 1
}) {
  const lang = customerContext.language || 'Hinglish';
  const name = customerContext.name && customerContext.name !== 'Unknown' ? customerContext.name : '';

  // 1. If intent is GREETING and no products, generate charismatic greeting
  if (intent.type === 'GREETING' && (!products || products.length === 0)) {
    return generateConversationalGreeting({ lang, name, history });
  }

  // 2. If products are present, generate consultative sales presentation of numbers
  if (products && products.length > 0) {
    const topProducts = products.slice(0, 4).map((p, idx) => {
      const rawNumber = p.productMobileNumber || '';
      const formattedNum = formatNumberBeauty(rawNumber, p);
      const subtotal = p.pricing?.nwFinalPrice || p.price || 0;
      const gst = Math.round(subtotal * 0.18);
      const total = subtotal + gst;
      const cat = p.category?.name || 'VIP Fancy Number';
      const sum = p.score ?? null;
      return {
        rank: idx + 1,
        number: formattedNum,
        rawNumber,
        category: cat,
        priceWithGst: total,
        sum
      };
    });

    const systemPrompt = `You are Eva, Senior VIP Mobile Number Consultant at Numberwale (est. 2010, 10+ years legacy, 1 Lakh+ happy clients across India). You have a warm, charming female sales personality (ladki ki personality).
Always use natural female grammatical verb endings in Hindi/Hinglish/Marathi ("karti hoon", "bataungi", "kar sakti hoon", "deti hoon" — NEVER "karta hoon" / "deta hun").
You are consulting a customer on WhatsApp who wants to buy prestigious VIP mobile numbers.

CUSTOMER:
- Name: ${name || 'Valued Client'}
- Language: Strictly respond in ${lang} (Hinglish/Hindi/English/Gujarati/Marathi)
- User's message: "${userMessage}"
${numerologyData ? `- Numerology: Driver Number (Mulank) ${numerologyData.mulank}, Ruling Planet: ${numerologyData.planet}` : ''}

INVENTORY SHORT-LIST:
${JSON.stringify(topProducts, null, 2)}
Total Available: ${totalCount} numbers (Page ${currentPage}/${totalPages})

SALES DIRECTIVES:
1. Speak with genuine warmth, charisma, and sales authority in ${lang}. Treat VIP numbers as prestigious personal and business assets.
2. Present the short-listed numbers clearly:
   - Number formatted with spaces (e.g. 9820 999 786)
   - Category / pattern aura (highlight why it's special — e.g. status, executive recall, lucky vibration, business branding)
   - Total price: ₹Amount (with 18% GST & official invoice included)
   - Clear buy syntax: "_buy <10-digit-number>_"
3. ${numerologyData ? 'Explain how these numbers match their birthday vibration/planet, and mention they can get their complete personalized mobile numerology report at https://www.numberwale.com/numerology' : ''}
4. Conclude with an engaging sales question: "Aapko inme se konsa number sabse royal lag raha hai? Ya budget/pattern mein kuch specific requirement hai?"
5. Mention they can type "more" for next page, "reset" for new search, or "agent" to connect with a senior manager.
6. WhatsApp formatting: use emojis, bold headers, line breaks. Avoid code blocks.`;

    try {
      const chatMessages = [
        ...history.slice(-4).map(h => ({
          role: h.role === 'bot' ? 'assistant' : 'user',
          content: h.text
        })),
        { role: 'user', content: userMessage }
      ];

      const aiText = await runLocalAgentChat({
        systemPrompt,
        messages: chatMessages,
        temperature: 0.6,
        maxTokens: 500
      });

      if (aiText && aiText.length > 50) {
        return aiText;
      }
    } catch (err) {
      console.log(`[AgentEngine] 🔄 LLM sales presentation fallback active (${err.message})`);
    }

    // High quality fallback
    return formatConversationalSearchResults({
      products,
      totalCount,
      currentPage,
      totalPages,
      lang,
      customerName: name,
      userQuery: userMessage,
      numerologyData
    });
  }

  // 3. Fallback for empty search
  return formatConversationalSearchResults({
    products: [],
    totalCount: 0,
    currentPage: 1,
    totalPages: 0,
    lang,
    customerName: name,
    userQuery: userMessage
  });
}

/**
 * Format 10 digit number into clean readable blocks
 * If customDesignProductMobileNumber exists (e.g. 967-*167*-72-*167*):
 * - Removes all '*' asterisks
 * - Replaces '-' hyphens with ' ' spaces
 */
function formatNumberBeauty(numStr, p) {
  const custom = p?.customDesignProductMobileNumber;
  if (custom && typeof custom === 'string' && custom.trim()) {
    const cleaned = custom
      .replace(/\*/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 10) return cleaned;
  }

  const raw = typeof numStr === 'string' ? numStr : (p?.productMobileNumber || '');
  if (raw.includes('*') || raw.includes('-')) {
    const cleaned = raw
      .replace(/\*/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 10) return cleaned;
  }

  const clean = String(raw).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return raw || 'N/A';
}
