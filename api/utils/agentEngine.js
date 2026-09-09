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
  helpline: "+91 9222 222 007 (9222222007)",
  email: "support@numberwale.com",
  officeAddress: "005, Building no.12-B, Sangeet Complex, Jesal Park, Bhayandar East, Thane / Mumbai, Maharashtra 401105, India",
  
  // 4-Step MNP Porting & Activation Journey
  process: {
    step1: "Select your desired VIP number & pay 100% securely online (UPI, Cards, Net Banking, or Credit Card EMI).",
    step2: "Numberwale generates & delivers the Unique Porting Code (UPC) and official GST invoice within 24 hours on WhatsApp, SMS & Email.",
    step3: "Visit any nearest telecom operator store (Jio, Airtel, Vi, BSNL) with your original Aadhar Card for mandatory biometric e-KYC to legally register the number in your name.",
    step4: "SIM gets activated in 3 to 5 business days nationwide (up to 15 days in J&K or North East) as per standard TRAI MNP regulations.",
    guarantee: "100% Money-Back Guarantee if porting fails due to any operator technical error.",
    upcValidity: "Standard UPC is valid for 4 days. If it expires before you visit the store, Numberwale issues a fresh UPC at zero extra cost."
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
export function detectLanguage(text) {
  if (!text) return 'Hinglish';
  // Devanagari script (Hindi or Marathi)
  if (/[\u0900-\u097F]/.test(text)) {
    if (/\b(आहे|नाही|कसा|कशी|करा|हवा|हवे|घ्यायचा|घ्यायचे|नमस्कार)\b/.test(text)) {
      return 'Marathi';
    }
    return 'Hindi';
  }
  // Gujarati script
  if (/[\u0A80-\u0AFF]/.test(text)) {
    return 'Gujarati';
  }
  // Roman Gujarati indicators
  if (/\b(kem cho|maja ma|bhai joye|aapo|karo|chhe)\b/i.test(text)) {
    return 'Gujarati';
  }
  // Roman Marathi indicators
  if (/\b(kasa ahes|kay karto|pahije|havay|aahe)\b/i.test(text)) {
    return 'Marathi';
  }
  // Explicit Pure English
  if (/^(hi|hello|hey|can you|i want|please show|do you have|what is|how much)\b/i.test(text) && !/\b(chahiye|batao|karo|hai|hoga|bhai|kaisa|milega|kitna)\b/i.test(text)) {
    return 'English';
  }
  return 'Hinglish';
}

export function detectCustomerIntent(rawMsg) {
  if (!rawMsg) return { type: 'SEARCH' };
  const text = rawMsg.toLowerCase().trim();

  // 0. Greetings / Small talk
  const greetingRegex = /^(hi|hello|hii|helo|hey|ok|okay|thanks|thank you|shukriya|theek hai|thik hai|👍|🙏|haan|ha|yes|no|nahi|hmm|hm|good|great|nice|👌|namaste|kem cho|pranam|kaisa hai|kaise ho)\b/i;
  if (greetingRegex.test(text)) {
    return { type: 'GREETING' };
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
  const systemPrompt = `You are Aman, Senior AI VIP Number Consultant at Numberwale (India's leading VIP mobile number company since 2010, 10+ years legacy, 1 Lakh+ happy clients).
Your job is to answer customer questions about Numberwale warmly, clearly, accurately, and sales-consultatively.

FACTS TO USE STRICTLY:
- MNP/Process: 4-step process. 1. Pay securely online -> 2. Receive Unique Porting Code (UPC) and official GST invoice within 24 hours on WhatsApp & SMS -> 3. Visit nearest Jio/Airtel/Vi/BSNL store with Aadhar card for biometric e-KYC -> 4. Activates in 3-5 business days under customer's own name.
- Networks: Works with any operator (Jio, Airtel, Vi, BSNL). Works on 4G/5G, can be activated as Prepaid or Postpaid, can convert to eSIM.
- Guarantee: 100% Money Back Guarantee if porting fails due to operator issues. UPC is valid 4 days; if expired, Numberwale provides a fresh UPC free of cost.
- Payments: 100% online & secure (UPI, Google Pay, PhonePe, Cards, Netbanking, Credit Card EMI). No COD because UPC is digital. Official GST invoice provided.
- Office: Head office in Bhayandar East, Thane / Mumbai, Maharashtra. Helpline: +91 9222 222 007.

TONE & RULES:
- Language: Strictly respond in ${lang} (if Hindi/Hinglish, use friendly and respectful Indian tone).
- Address customer politely as "${greeting || 'ji'}".
- Length: 3 to 5 clear sentences with relevant emojis.
- ALWAYS conclude by warmly asking what kind of VIP number, pattern, or budget they are looking for today!`;

  try {
    const aiResponse = await runLocalAgentChat({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.5,
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
      return `नमस्ते ${greeting}! 🙏 नंबरवाले से VIP नंबर लेना बेहद आसान और 100% कानूनी है:\n\n` +
        `1️⃣ अपनी पसंद का नंबर चुनकर सुरक्षित पेमेंट करें।\n` +
        `2️⃣ 24 घंटे में आपको WhatsApp और SMS पर UPC (Unique Porting Code) और GST इनवॉइस मिलेगा।\n` +
        `3️⃣ अपने नज़दीकी Jio, Airtel, Vi या BSNL स्टोर जाकर आधार कार्ड से बायोमेट्रिक e-KYC करवाएं।\n` +
        `4️⃣ 3-5 दिनों में नंबर सीधे आपके अपने नाम पर एक्टिव हो जाएगा! 🎉\n\n` +
        `🛡️ *100% Money Back Guarantee!* आप कैसा नंबर ढूंढ रहे हैं? मुझे बताइए! 😊`;
    } else if (lang === 'Gujarati') {
      return `નમસ્તે ${greeting}! 🙏 નંબરવાલેથી VIP નંબર લેવો ખૂબ જ સરળ અને 100% કાનૂની છે:\n\n` +
        `1️⃣ તમારી પસંદગીનો નંબર પસંદ કરી ઓનલાઇન સુરક્ષિત પેમેન્ટ કરો.\n` +
        `2️⃣ 24 કલાકમાં તમને WhatsApp પર UPC કોડ અને પાકું GST બિલ મળશે.\n` +
        `3️⃣ નજીકના Jio/Airtel/Vi સ્ટોર પર જઈ આધાર કાર્ડથી બાયોમેટ્રિક e-KYC કરાવો.\n` +
        `4️⃣ 3-5 દિવસમાં સિમ તમારા નામે એક્ટિવેટ થઈ જશે! 🎉\n\n` +
        `🛡️ *100% Money Back Guarantee!* તમારે કેવો નંબર જોઈએ છે? જણાવો! 😊`;
    } else if (lang === 'Marathi') {
      return `नमस्कार ${greeting}! 🙏 नंबरवाले वरून VIP नंबर घेणे अत्यंत सोपे आणि 100% कायदेशीर आहे:\n\n` +
        `1️⃣ आपल्या पसंतीचा नंबर निवडून सुरक्षित पेमेंट करा.\n` +
        `2️⃣ 24 तासांच्या आत WhatsApp वर UPC कोड आणि GST बिल मिळेल.\n` +
        `3️⃣ जवळच्या Jio, Airtel, Vi किंवा BSNL स्टोअरमध्ये जाऊन आधार कार्डद्वारे e-KYC करा.\n` +
        `4️⃣ 3 ते 5 दिवसांत नंबर थेट तुमच्या नावाने सुरू होईल! 🎉\n\n` +
        `🛡️ *100% Money Back Guarantee!* तुम्हाला कसा नंबर हवा आहे? सांगा! 😊`;
    } else if (lang === 'Hinglish') {
      return `Namaste ${greeting}! 🙏 Numberwale se VIP number lena bilkul simple aur 100% legal hai:\n\n` +
        `1️⃣ Number select karke secure payment karein.\n` +
        `2️⃣ 24 hours ke andar aapko WhatsApp & SMS par UPC (Unique Porting Code) aur official GST invoice mil jayega.\n` +
        `3️⃣ Nearest Jio, Airtel, Vi ya BSNL store jakar Aadhar card se biometric e-KYC karwayein.\n` +
        `4️⃣ 3-5 business days mein SIM aapke apne naam par activate ho jayega! 🎉\n\n` +
        `🛡️ *100% Money Back Guarantee!* Aapko kis tarah ka pattern ya budget chahiye? Batayein! 😊`;
    } else {
      return `Hello ${greeting}! 🙏 Getting a VIP number with Numberwale is 100% legal, fast, and simple:\n\n` +
        `1️⃣ Select your number and pay securely online.\n` +
        `2️⃣ Receive your Unique Porting Code (UPC) and GST invoice within 24 hours on WhatsApp.\n` +
        `3️⃣ Visit your nearest telecom store (Jio, Airtel, Vi, BSNL) with your Aadhar card for biometric e-KYC.\n` +
        `4️⃣ Your new SIM activates under your own name in 3-5 business days! 🎉\n\n` +
        `🛡️ *100% Money-Back Guarantee!* What kind of VIP number are you looking for today? 😊`;
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
 * Generate a friendly, charismatic greeting introducing Aman from Numberwale.
 */
export async function generateConversationalGreeting({ lang = 'Hinglish', name = '', history = [] }) {
  const greeting = name && name !== 'Unknown' ? `${name} ji` : '';

  const systemPrompt = `You are Aman, Senior VIP Mobile Number Consultant at Numberwale (India's #1 VIP phone number destination since 2010, 10+ years legacy, 1 Lakh+ happy clients across India).
The customer has greeted you on WhatsApp.
Respond warmly, respectfully, and enthusiastically in ${lang}.
Introduce yourself as Aman from Numberwale.
Ask what kind of prestigious VIP number they have in mind today:
- Lucky birthdate / numerology match
- Royal repeating sequences (e.g. 9999, 786, 0007)
- Corporate/business branding or mirror numbers
Encourage them to tell you their favorite digits, pattern, or budget.
Keep it punchy (3-4 sentences), charismatic, with polite Indian conversational flair and emojis.`;

  try {
    const aiText = await runLocalAgentChat({
      systemPrompt,
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.6,
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
    return `नमस्ते ${greeting || 'जी'}! 🙏 मैं अमन, नंबरवाले से आपका Senior VIP Number Consultant।\n\n` +
      `2010 से हमने 1 लाख से अधिक संतुष्ट ग्राहकों को उनके सपनों का VIP मोबाइल नंबर दिलाया है! ✨\n\n` +
      `आज आप कैसा नंबर ढूंढ रहे हैं?\n` +
      `🌟 बर्थडे / न्यूमरोलॉजी से मैच करता लकी नंबर\n` +
      `👑 रॉयल रिपीटिंग नंबर्स (जैसे 9999, 0007, 786)\n` +
      `💼 बिज़नेस ब्रांडिंग या मिरर पैटर्न्स?\n\n` +
      `आप अपना पसंदीदा डिजिट या बजट बताइए, मैं बेस्ट ऑप्शंस दिखाता हूँ! 😊`;
  } else if (lang === 'Gujarati') {
    return `નમસ્તે ${greeting || 'જી'}! 🙏 હું અમન, નંબરવાલે તરફથી તમારો Senior VIP Number Consultant.\n\n` +
      `2010 થી અમે 1 લાખથી વધુ ખુશ ગ્રાહકોને શ્રેષ્ઠ VIP નંબર આપ્યા છે! ✨\n\n` +
      `આજે તમે કેવો નંબર શોધી રહ્યા છો?\n` +
      `🌟 જન્મતારીખ / ન્યૂમરોલોજી મુજબ લકી નંબર\n` +
      `👑 રોયલ રિપીટિંગ પેટર્ન (દા.ત. 9999, 786, 0007)\n` +
      `💼 બિઝનેસ બ્રાન્ડિંગ કે મિરર નંબર?\n\n` +
      `તમારો મનપસંદ આંકડો કે બજેટ જણાવો, હું બેસ્ટ નંબર્સ બતાવું! 😊`;
  } else if (lang === 'Marathi') {
    return `नमस्कार ${greeting || 'जी'}! 🙏 मी अमन, नंबरवाले कडून तुमचा Senior VIP Number Consultant.\n\n` +
      `2010 पासून आम्ही 1 लाखाहून अधिक समाधानी ग्राहकांना त्यांचे आवडते VIP नंबर दिले आहेत! ✨\n\n` +
      `आज तुम्ही कसा नंबर शोधत आहात?\n` +
      `🌟 जन्मतारीख / न्यूमरोलॉजी जुळणारा लकी नंबर\n` +
      `👑 रॉयल पॅटर्न (उदा. 9999, 786, 0007)\n` +
      `💼 बिझनेस ब्रँडिंग किंवा मिरर नंबर?\n\n` +
      `तुमचा आवडता अंक किंवा बजेट सांगा, मी सर्वोत्तम पर्याय शोधून देतो! 😊`;
  } else if (lang === 'English') {
    return `Hello ${greeting || 'there'}! 🙏 I'm Aman, your Senior VIP Number Consultant at Numberwale.\n\n` +
      `Since 2010, we've helped over 100,000+ happy clients secure their ideal VIP & fancy mobile numbers! ✨\n\n` +
      `What kind of prestigious number are you looking for today?\n` +
      `🌟 Lucky birthdate / numerology match\n` +
      `👑 Royal repeating sequence (like 9999, 786, 0007)\n` +
      `💼 Corporate branding or mirror patterns?\n\n` +
      `Tell me your favorite digits or budget, and I'll fetch the best options for you! 😊`;
  } else {
    // Hinglish
    return `Namaste ${greeting || 'ji'}! 🙏 Main Aman, Numberwale se aapka Senior VIP Number Consultant.\n\n` +
      `2010 se humne 1 Lakh+ happy clients ko unka dream VIP mobile number provide kiya hai! ✨\n\n` +
      `Aaj aap kaisa prestigious number dekhna chahte hain?\n` +
      `🌟 Lucky Birthdate / Numerology match\n` +
      `👑 Royal repeating patterns (jaise 9999, 786, 0007)\n` +
      `💼 Business branding ya Mirror patterns?\n\n` +
      `Apna favourite digit ya budget batayein, main best options nikal ke deta hun! 😊`;
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
      return `माफ़ कीजिये ${nameSalutation}! 😔 आपकी इस खोज से मेल खाते नंबर्स अभी उपलब्ध नहीं हैं।\n\n💡 आप कोई दूसरा पैटर्न ट्राई कर सकते हैं (जैसे _req 786_, _mirror numbers_, या _ending 9999_)। अपना बजट या पसंदीदा अंक बताइए, मैं बेस्ट ऑप्शंस दिखाता हूँ! 😊`;
    } else if (lang === 'Gujarati') {
      return `માફ કરશો ${nameSalutation}! 😔 તમારી શોધ સાથે મેળ ખાતા નંબર્સ હાલ ઉપલબ્ધ નથી.\n\n💡 તમે અન્ય પેટર્ન અજમાવી શકો છો (દા.ત. _req 786_ અથવા _mirror numbers_). તમારું બજેટ જણાવો! 😊`;
    } else if (lang === 'Marathi') {
      return `क्षमस्व ${nameSalutation}! 😔 या शोधाशी जुळणारे नंबर सध्या उपलब्ध नाहीत.\n\n💡 तुम्ही दुसरा पॅटर्न वापरून पाहू शकता (उदा. _req 786_ किंवा _mirror numbers_). बजेट सांगा, मी मदत करतो! 😊`;
    } else if (lang === 'English') {
      return `Oops ${nameSalutation}! 😔 No numbers matching this exact search are currently available.\n\n💡 Try popular patterns like _req 786_, _mirror numbers_, or _ending 9999_. Tell me your budget or preferred digits! 😊`;
    } else {
      return `Oops ${nameSalutation}! 😔 Is search se match karte hue numbers abhi available nahi hain.\n\n💡 Aap koi dusra pattern try kar sakte hain (jaise _req 786_, _mirror numbers_, ya _ending 9999_). Apna favourite digit ya budget batayein, main best options nikalta hun! 😊`;
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
    const formattedNum = formatNumberBeauty(rawNumber);
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
      const formattedNum = formatNumberBeauty(rawNumber);
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

    const systemPrompt = `You are Aman, Senior VIP Mobile Number Consultant at Numberwale (est. 2010, 10+ years legacy, 1 Lakh+ happy clients across India).
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
 * Format 10 digit number into clean readable blocks (e.g. 9820-999-786)
 */
function formatNumberBeauty(numStr) {
  const clean = String(numStr).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 10)}`;
  }
  return numStr;
}
