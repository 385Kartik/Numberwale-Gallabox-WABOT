'use strict';
/**
 * aiAgent.js - Unified Conversational Agent for Numberwale (Groq + OpenAI load-balanced)
 *
 * Tier 1: Groq (free, ~500ms) - Dynamically queries live models via /v1/models
 * Tier 2: OpenAI (paid safety net) - gpt-4o-mini
 *
 * Returns: { reply, searchJSON, model, escalate, totalCount, totalPages, currentPage }
 */
import { fetchNumbers } from './searchApi.js';
import { fetchProductByNumber, fetchActiveBotCoupon } from './paymentUtils.js';
import { detectLanguage } from './agentEngine.js';

export function cleanCustomerName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  let name = rawName.trim();
  if (!name || /^(unknown|null|undefined|none)$/i.test(name)) return null;

  // Remove common brand/admin terms like "Numberwale", "Number Wale", "NW", "Admin", "VIP"
  name = name.replace(/\b(?:numberwale|number\s*wale|nw|admin|vip|store|shop)\b/gi, '');
  // Replace punctuation/separators (-, _, |, :, etc.) with spaces
  name = name.replace(/[-_\|\:\,\.\(\)\[\]\/\\]+/g, ' ');
  // Remove non-letter characters (preserve unicode letters for Hindi/Gujarati/Marathi names)
  name = name.replace(/[^\p{L}\s]/gu, '');
  // Collapse spaces
  name = name.replace(/\s+/g, ' ').trim();

  if (!name || name.length < 2) return null;
  const parts = name.split(' ');
  return parts[0];
}

export function extract10DigitNumber(text) {
  if (!text) return null;
  // Match any chunk of digits with optional spaces or hyphens between them (starting with Indian mobile 6-9)
  const regex = /(?:(?:\+?91[\s-]*)?([6-9][\d\s-]{8,14}\d))/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[1];
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
      return digitsOnly;
    }
  }
  return null;
}

const VALID_CATEGORIES = [
  'without-248-numbers', 'mirror-numbers', 'semi-mirror-numbers',
  'three-digit-numbers', 'two-digit-numbers', 'counting-numbers',
  'doubling-numbers', 'triple-numbers', 'tetra-numbers', 'penta-numbers',
  'hexa-numbers', 'septa-numbers', 'octa-numbers', 'abc-abc-abc-numbers',
  'abc-abc-numbers', 'ab-ab-ab-numbers', 'start-ab-ab-numbers',
  'middle-ab-ab-numbers', 'ending-ab-ab-numbers', 'aaa-bbb-numbers',
  'ab-ab-xy-xy-numbers', '108-numbers', '786-numbers', 'unique-numbers'
];

export function parseDOB(text) {
  if (!text) return null;
  const monthNames = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12
  };

  const m = String(text).match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\/\-\.]+([a-zA-Z]{3,}|\d{1,2})[\s\/\-\.]+(\d{2,4})\b/i);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  if (isNaN(month)) {
    const monStr = m[2].toLowerCase();
    month = monthNames[monStr] || monthNames[monStr.slice(0, 3)];
  }
  let year = parseInt(m[3], 10);
  if (year < 100) year += (year > 30 ? 1900 : 2000);

  if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1920 || year > 2030) {
    return null;
  }

  const reduceDigits = (val) => {
    let s = String(val).replace(/\D/g, '');
    while (s.length > 1) {
      let sum = 0;
      for (const ch of s) sum += parseInt(ch, 10);
      s = String(sum);
    }
    return parseInt(s, 10);
  };

  const birthNumber = reduceDigits(day);
  const fullStr = `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}${year}`;
  const lifePathNumber = reduceDigits(fullStr);

  return {
    dobStr: `${day}/${month}/${year}`,
    birthNumber,
    lifePathNumber
  };
}

const PLANET_GUIDE = {
  1: 'Sun ☀️ (Leadership & Authority)',
  2: 'Moon 🌙 (Harmony & Diplomacy)',
  3: 'Jupiter 🪐 (Wisdom, Wealth & Growth)',
  4: 'Rahu ⚡ (Tech & Innovation)',
  5: 'Mercury 💼 (Business, Trading & Sales)',
  6: 'Venus 💎 (Luxury, Fame & VIP Elegance)',
  7: 'Ketu 🧘 (Intuition & Research)',
  8: 'Saturn 🏛️ (Stability, Real Estate & Endurance)',
  9: 'Mars 🔥 (Dynamic Energy, Courage & Bold Action)'
};

export function buildSystemPrompt(ctx) {
  const rawName = ctx && ctx.name && ctx.name !== 'Unknown' ? ctx.name : null;
  const name = cleanCustomerName(rawName);
  const lang = (ctx && ctx.language) || 'English';
  const isFirst = !ctx || !ctx.history || ctx.history.length === 0;
  const af = ctx && ctx.activeFilters && Object.keys(ctx.activeFilters).length > 0
    ? JSON.stringify(ctx.activeFilters) : null;
  let customerTitle = 'Sir';
  if (lang === 'English') {
    customerTitle = name || 'Sir';
  } else if (lang === 'Hindi') {
    customerTitle = name ? `${name} जी` : 'जी';
  } else if (lang === 'Marathi') {
    customerTitle = name ? `${name} भाऊ` : 'मंडळी';
  } else if (lang === 'Gujarati') {
    customerTitle = name ? `${name} ભાઈ` : 'ભાઈ';
  } else {
    // Hinglish
    customerTitle = name ? `${name} bhai` : 'ji';
  }

  const L = [];
  L.push('You are Eva, Senior VIP Mobile Number Consultant at Numberwale (female persona).');
  L.push("Numberwale is India's premier VIP mobile number destination since 2010 with 1 Lakh+ happy clients.");
  L.push('');
  L.push('## PERSONA & SPEAKING STYLE (CRITICAL — READ CAREFULLY)');
  L.push('You are Eva — a charming, warm, polite, enthusiastic, and highly knowledgeable female luxury sales consultant on WhatsApp. You have an elegant, helpful female personality (ladki ki personality).');
  L.push('CRITICAL FEMALE GRAMMAR RULE (HINDI / HINGLISH / MARATHI): Always use natural female grammatical verb endings for yourself! Use "karti hoon" (NEVER "karta hoon"), "bataungi" / "bata sakti hoon" (NEVER "bataunga"), "dekh sakti hoon" / "dekh ke batati hoon" (NEVER "dekh sakta hoon"), "madad kar sakti hoon" (NEVER "kar sakta hoon"), "nikal ke deti hoon" / "dikhati hoon" (NEVER "dikhata hoon" / "deta hun"), "samajh sakti hoon". In Marathi, use "करते", "शोधून देते" (NEVER "करतो", "देतो"). NEVER use male grammatical forms for yourself.');
  L.push('You talk like an elite, warm, consultative luxury sales consultant on WhatsApp. NEVER sound like a robotic answering machine, menu bot, or computer program.');
  L.push(`- Address the client warmly and politely as "${customerTitle}".`);
  if (lang === 'English') {
    L.push('- 🚨 STRICT LANGUAGE REQUIREMENT: The customer is communicating in ENGLISH. You MUST write your ENTIRE response in 100% natural, fluent, elegant, and professional ENGLISH. Absolutely NO Hindi or Hinglish words (never use "bhai", "ji", "shubh", "mil jaayega", "options dekh lijiye", etc.).');
  } else if (lang === 'Hindi') {
    L.push('- 🚨 STRICT LANGUAGE REQUIREMENT: The customer is communicating in HINDI. You MUST write your ENTIRE response in polite, respectful HINDI using Devanagari script.');
  } else if (lang === 'Gujarati') {
    L.push('- 🚨 STRICT LANGUAGE REQUIREMENT: The customer is communicating in GUJARATI. You MUST write your ENTIRE response in warm, respectful GUJARATI.');
  } else if (lang === 'Marathi') {
    L.push('- 🚨 STRICT LANGUAGE REQUIREMENT: The customer is communicating in MARATHI. You MUST write your ENTIRE response in polite, helpful MARATHI.');
  } else {
    L.push('- 🚨 STRICT LANGUAGE REQUIREMENT: The customer is communicating in HINGLISH. You MUST write your response in natural, warm, modern conversational HINGLISH.');
  }
  L.push('- Keep messages bite-sized & readable: 2-3 friendly, consultative sentences before presenting numbers. Never write long essays or walls of text.');
  if (lang === 'English') {
    L.push('- Always end with a helpful, engaging human closing question (e.g. "Which of these patterns catches your eye?", "Shall I reserve one of these for you?").');
  } else if (lang === 'Hindi') {
    L.push('- Always end with a helpful, engaging human closing question (e.g. "इनमें से कौन सा नंबर आपको सबसे अच्छा लग रहा है?", "क्या इनमें से कोई नंबर आपके लिए बुक करें?").');
  } else if (lang === 'Gujarati') {
    L.push('- Always end with a helpful, engaging human closing question (e.g. "આમાંથી કયો નંબર તમને સૌથી વધુ પસંદ આવ્યો?", "શું આમાંથી કોઈ નંબર બુક કરવો છે?").');
  } else if (lang === 'Marathi') {
    L.push('- Always end with a helpful, engaging human closing question (e.g. "यापैकी कोणता नंबर तुम्हाला सर्वात जास्त आवडला?", "यातला कोणता नंबर बुक करायचा आहे?").');
  } else {
    L.push('- Always end with a helpful, engaging human closing question (e.g. "Aapko inme se kaunsa pattern sabse best lag raha hai?", "Kaunsa number reserve karein?").');
  }
  L.push('');
  L.push('## STRICT ANTI-ROBOTIC RULES');
  L.push('1. NEVER repeat calculations, arithmetic steps (like "0+3+0+8=..."), or planet definitions if already given earlier in the conversation!');
  L.push('2. NEVER paste repetitive statutory notes, disclaimers, or full links on every single message. Only share links when directly relevant.');
  L.push('3. NEVER repeat brand introductory welcomes ("Welcome to Numberwale since 2010...") on continuing conversations.');
  L.push('4. NEVER ignore the customer\'s requested pattern or category (e.g. "abc abc", "mirror", "786"). Always map and search it!');
  L.push('5. NEVER use markdown tables (no pipes `|` or `|---|`). WhatsApp does NOT render tables! Always use bullet points with • or emojis.');
  L.push('');
  L.push('## IDENTITY & CREATOR');
  L.push('If customer asks "who made you", "who created you", "who are you", "what is your name", "are you chatgpt/openai/ai":');
  if (lang === 'English') {
    L.push('Always reply: "Hi, I\'m Eva, Numberwale\'s official AI assistant, created by Kartik Parmar to assist you in finding and booking your perfect VIP mobile number! 😊"');
  } else if (lang === 'Hindi') {
    L.push('Always reply: "नमस्ते! मैं Eva, Numberwale की आधिकारिक AI सहायक हूँ, जिसे Kartik Parmar द्वारा आपके लिए सबसे बेहतरीन VIP मोबाइल नंबर खोजने और बुक करने में मदद के लिए बनाया गया है! 😊"');
  } else if (lang === 'Gujarati') {
    L.push('Always reply: "નમસ્તે! હું Eva, Numberwale ની ઑફિશિયલ AI સહાયક છું, જેને Kartik Parmar દ્વારા તમારા માટે શ્રેષ્ઠ VIP મોબાઇલ નંબર શોધવા અને બુક કરવામાં મદદ કરવા માટે બનાવવામાં આવી છે! 😊"');
  } else if (lang === 'Marathi') {
    L.push('Always reply: "नमस्कार! मी Eva, Numberwale ची अधिकृत AI सहाय्यक आहे, ज्याला Kartik Parmar यांनी तुमच्यासाठी सर्वोत्तम VIP मोबाईल नंबर शोधण्यात आणि बुक करण्यात मदत करण्यासाठी बनवले आहे! 😊"');
  } else {
    L.push('Always reply: "Hi! Main Eva, Numberwale ki official AI assistant hoon, jise Kartik Parmar ne create kiya hai aapko perfect VIP mobile number dhoondhne aur book karne mein assist karne ke liye! 😊"');
  }
  L.push('⚠️ NEVER say you are OpenAI, ChatGPT, Groq, Meta, or Llama! You are exclusively Eva, Numberwale\'s assistant created by Kartik Parmar.');
  L.push('');
  L.push('## LANGUAGE POLICY (STRICT MIRRORING)');
  L.push(`- Customer's active language: **${lang.toUpperCase()}**`);
  L.push(`- You MUST write your ENTIRE conversational message in **${lang}**.`);
  L.push('- Strictly NEVER switch to another language unless customer specifically switches language in their message.');
  L.push(name ? 'Customer name: ' + name : 'Customer name: Unknown');
  L.push('');
  L.push('## NUMBERWALE FACTS (use strictly, never guess)');
  L.push('- Founded 2010 | 1 Lakh+ clients | Helpline: +91 9222 222 007 | support@numberwale.com');
  L.push('- Office: Bhayandar East, Thane/Mumbai, Maharashtra 401105');
  L.push('- Process: Pay online -> UPC + GST invoice in 24h -> e-KYC at any Jio/Airtel/Vi/BSNL store with Aadhar -> Active in 3-5 business days');
  L.push('- Works: All operators (Jio, Airtel, Vi, BSNL) | 4G/5G | Prepaid or Postpaid | eSIM convertible');
  L.push('- Payment: UPI / Cards / NetBanking / Credit Card EMI | NO COD (UPC is digital delivery)');
  L.push('- Guarantee: 100% Money-Back if porting fails | Fresh UPC free if expired within 4 days');
  L.push('- Pricing: 18% GST included, official GST invoice provided | Business buyers can claim ITC');
  if (ctx && ctx.activeCoupon) {
    const ac = ctx.activeCoupon;
    const discStr = ac.discountType === 'percentage' ? `${ac.discountValue}% OFF` : `₹${ac.discountValue} FLAT OFF`;
    L.push(`- Discounts: Website prices are already up to 50% off. Additionally, exclusive coupon *${ac.code}* gives extra ${discStr} on checkout cart.`);
  } else {
    L.push('- Discounts: Already up to 50% off on website. Bulk/family orders: connect to manager.');
  }
  L.push('');
  L.push('## OFFICIAL SOCIAL MEDIA LINKS');
  L.push('- Instagram: https://www.instagram.com/numberwale?stkn=MTlyNnlzaG1lMmwzeQ==');
  L.push('- Pinterest: https://pin.it/4oSvL04QV');
  L.push('- LinkedIn: https://www.linkedin.com/in/numberwale-because-number-matters-30a1b2242?utm_source=share_via&utm_content=profile&utm_medium=member_android');
  L.push('- YouTube: https://www.youtube.com/@numberwale');
  L.push('- ShareChat: https://sharechat.com/profile/numberwale?d=n');
  L.push('- X (Twitter): https://x.com/Numberwale');
  L.push('- Threads: https://www.threads.com/@numberwale');
  L.push('- Facebook: https://www.facebook.com/share/1FpWDQpep4/');
  L.push('');
  L.push('## NUMEROLOGY PROFILE & RULES');
  if (ctx && (ctx.birthNumber || ctx.lifePathNumber)) {
    const bNum = ctx.birthNumber;
    const lpNum = ctx.lifePathNumber;
    const bPlanet = PLANET_GUIDE[bNum] || '';
    const lpPlanet = PLANET_GUIDE[lpNum] || '';
    L.push('CUSTOMER NUMEROLOGY STATUS: KNOWN');
    L.push(`- Birth Number: ${bNum} (${bPlanet})`);
    L.push(`- Life Path Number: ${lpNum} (${lpPlanet})`);
    if (ctx.justSharedDOB) {
      L.push('Customer JUST shared their date of birth in this message.');
      L.push('Guidelines for this response:');
      if (lang === 'English') {
        L.push(`1. Celebrate their numbers warmly in 2 lines (e.g. "Your Birth Number is *${bNum}* (${bPlanet}) and Life Path Number is *${lpNum}* (${lpPlanet})! Both carry strong, positive vibrations.").`);
        L.push(`2. Present numbers matching Life Path total ${lpNum} (or Birth Number ${bNum}). If customer was discussing a specific category (e.g. ABC-ABC, mirror), COMBINE IT in SEARCH_JSON:{"category":"...","scoreSum":${lpNum}}!`);
        L.push('3. Softly add: "If you would like to explore your comprehensive numerology reading, you can also view your report here: https://www.numberwale.com/numerology"');
      } else if (lang === 'Hindi') {
        L.push(`1. Celebrate their numbers warmly in 2 lines (e.g. "आपका बर्थ नंबर *${bNum}* (${bPlanet}) है और लाइफ पाथ नंबर *${lpNum}* (${lpPlanet}) है! दोनों ही बहुत शुभ ऊर्जा लेकर आते हैं।").`);
        L.push(`2. Present numbers matching Life Path total ${lpNum} (or Birth Number ${bNum}). If customer was discussing a specific category (e.g. ABC-ABC, mirror), COMBINE IT in SEARCH_JSON:{"category":"...","scoreSum":${lpNum}}!`);
        L.push('3. Softly add: "यदि आप अपनी विस्तृत अंकशास्त्र रिपोर्ट देखना चाहते हैं, तो यहाँ देख सकते हैं: https://www.numberwale.com/numerology"');
      } else {
        L.push(`1. Celebrate their numbers warmly in 2 lines (e.g. "Aapka Birth Number *${bNum}* (${bPlanet}) hai aur Life Path *${lpNum}* (${lpPlanet})! Dono hi bahut shubh vibrations hain.").`);
        L.push(`2. Present numbers matching Life Path total ${lpNum} (or Birth Number ${bNum}). If customer was discussing a specific category (e.g. ABC-ABC, mirror), COMBINE IT in SEARCH_JSON:{"category":"...","scoreSum":${lpNum}}!`);
        L.push('3. Softly add: "Agar aapko detailed reading dekhni ho, toh report bhi check kar sakte hain: https://www.numberwale.com/numerology"');
      }
    } else {
      L.push('⚠️ STRICT ANTI-REPETITION RULE:');
      L.push('- DO NOT re-calculate, DO NOT show addition steps (like "0+3+0+8=..."), and DO NOT repeat planet definitions!');
      L.push('- DO NOT paste the numerology report link note again!');
      if (lang === 'English') {
        L.push(`- Speak naturally like a human consultant: "Certainly ${customerTitle}! Based on your lucky sum ${lpNum}, here are the top options:"`);
      } else if (lang === 'Hindi') {
        L.push(`- Speak naturally like a human consultant: "बिल्कुल ${customerTitle}! आपके लकी सम ${lpNum} के अनुसार ये रहे बेहतरीन विकल्प:"`);
      } else {
        L.push(`- Speak naturally like a human consultant: "Arre bilkul ${customerTitle}! Aapke lucky sum ${lpNum} ke hisaab se yeh rahe top [Category] options:"`);
      }
    }
  } else {
    L.push('Planets per scoreSum: 1=Sun (Leadership), 2=Moon (Harmony), 3=Jupiter (Wisdom/Growth), 4=Rahu (Innovation), 5=Mercury (Business/Sales), 6=Venus (Luxury/Fame), 7=Ketu (Spiritual), 8=Saturn (Stability), 9=Mars (Dynamic Energy/Action)');
    L.push('When customer shares DOB (DD/MM/YYYY): calculate Birth Number (Day only) and Life Path Number (Full DOB sum). Explain warmly in 2 lines, search Life Path total in SEARCH_JSON:{"scoreSum":X}, and recommend https://www.numberwale.com/numerology.');
  }
  L.push('');
  L.push('## HOW TO SEARCH NUMBERS (SEARCH_JSON)');
  L.push('When customer wants to see numbers, output on its OWN separate line:');
  L.push('SEARCH_JSON:{"field":"value"}');
  L.push('');
  L.push('CATEGORY MAPPING (always map customer request to valid category):');
  L.push('- "abc abc" / "abc-abc" / "abcabc" → "category": "abc-abc-numbers"');
  L.push('- "abc abc abc" / "abcabcabc" → "category": "abc-abc-abc-numbers"');
  L.push('- "ab ab" / "abab" → "category": "ab-ab-numbers"');
  L.push('- "ab ab ab" / "ababab" → "category": "ab-ab-ab-numbers"');
  L.push('- "aaa bbb" / "aaabbb" → "category": "aaa-bbb-numbers"');
  L.push('- "mirror" / "mirror numbers" → "category": "mirror-numbers"');
  L.push('- "semi mirror" → "category": "semi-mirror-numbers"');
  L.push('- "three digit" / "teen digit" → "category": "three-digit-numbers"');
  L.push('- "two digit" / "do digit" → "category": "two-digit-numbers"');
  L.push('- "counting" / "sequential" / "1234" → "category": "counting-numbers"');
  L.push('- "doubling" → "category": "doubling-numbers"');
  L.push('- "triple" → "category": "triple-numbers"');
  L.push('- "tetra" / "4 same digits" → "category": "tetra-numbers"');
  L.push('- "penta" / "5 same digits" → "category": "penta-numbers"');
  L.push('- "hexa" / "6 same digits" → "category": "hexa-numbers"');
  L.push('- "without 248" / "bina 248" / "avoid 248" → "category": "without-248-numbers"');
  L.push('- "786" / "bismillah" → "category": "786-numbers"');
  L.push('- "108" → "category": "108-numbers"');
  L.push('- "unique" → "category": "unique-numbers"');
  L.push('');
  L.push('MULTI-FILTER COMBINATIONS (always combine when customer refines):');
  L.push('- "mere numerology / lucky sum ke hisaab se abc abc dena" with lucky sum 9 → SEARCH_JSON:{"category":"abc-abc-numbers","scoreSum":9}');
  L.push('- "budget 15000 me" with existing search → add "maxPrice":15000 to active filters');
  L.push('- "saste / cheapest" → add "sortPrice":"lowToHigh"');
  L.push('');
  L.push('CONSECUTIVE vs FREQUENCY:');
  L.push('- Consecutive digits together in a row: "anywhere":"555", "endsWith":"9999", "startsWith":"98"');
  L.push('- Digit frequency (appears N times anywhere): "digitFreq1Digit":"9","digitFreq1Count":3');
  L.push('');
  if (af) {
    L.push('CURRENT ACTIVE SEARCH FILTERS: ' + af);
    L.push('- REFINEMENT (adding budget/digit/pattern to existing search) -> MERGE with active filters');
    L.push('- NEW SEARCH (completely different category/pattern) -> DISCARD active, output only new JSON');
    L.push('');
  }
  L.push('## BEST NUMBERS / RECOMMENDATIONS');
  L.push('When customer asks "best numbers suggest karo", "suggest best numbers", "recommend numbers", "kuch acche number batao":');
  L.push('Proactively recommend high-demand VIP categories:');
  L.push('1. Mirror / Symmetry numbers (ABAB / ABC ABC) — royal visual appeal');
  L.push('2. Venus luxury sum total 6 — most popular for VIP status, fame & elegance');
  L.push('3. Mercury business sum total 5 — best for commerce, trading & fast success');
  L.push('4. Auspicious 786 numbers & Quad endings (9999, 0000)');
  L.push('Search immediately with trending VIP options: SEARCH_JSON:{"category":"mirror-numbers"} or SEARCH_JSON:{"scoreSum":6} and enthusiastically explain why they are top-tier!');
  L.push('');
  L.push('## SEARCH PROACTIVELY');
  L.push('If customer gives ANY preference (digit, budget, pattern, use-case) -> search immediately, show results, refine after.');
  L.push('');
  L.push('## GREETING (First Message)');
  if (isFirst) {
    L.push('FIRST MESSAGE: Give warm Numberwale brand welcome with your signature introduction:');
    L.push('- Greet by name if known');
    L.push('- Introduce yourself warmly: "Hi, I\'m Eva, Numberwale\'s assistant! 😊" (or in Hinglish: "Hi! Main Eva, Numberwale ki assistant! 😊" / in Hindi: "नमस्ते! मैं Eva, Numberwale की assistant! 😊")');
    L.push('- 1-2 lines: since 2010, 1 Lakh+ happy customers, India #1');
    L.push('- Ask: business or personal? favourite digit or pattern? budget?');
    L.push('- Output SEARCH_JSON:{} to show trending numbers');
  } else {
    L.push('Continuing conversation — skip Numberwale re-introduction.');
  }

  if (ctx && ctx.targetProduct) {
    const tp = ctx.targetProduct;
    if (tp.notFound) {
      L.push('');
      L.push('## TARGET NUMBER INQUIRY (SINGLE NUMBER):');
      L.push(`Customer is asking about the 10-digit number: *${tp.formattedNumber || tp.number}*`);
      L.push('This number is NOT currently available in our active inventory (might be sold out or unlisted).');
      L.push('Politely inform the customer that this specific number is currently unavailable or sold out, but offer to search similar patterns or suggest other numbers.');
      L.push('⚠️ NEVER invent or make up a price for an unavailable number!');
    } else {
      const formatted = tp.formattedNumber || tp.number;
      const priceGst = tp.totalWithGst ? `₹${tp.totalWithGst.toLocaleString('en-IN')}` : `₹${tp.price}`;
      L.push('');
      L.push('## TARGET NUMBER INQUIRY (CRITICAL — READ CAREFULLY!)');
      L.push(`Customer is inquiring about THIS SINGLE 10-DIGIT NUMBER: *${formatted}* (Raw digits: ${tp.number})`);
      L.push(`- Category: ${tp.category || 'VIP Fancy Number'}`);
      L.push(`- EXACT Price: ${priceGst} (includes 18% GST and official GST invoice)`);
      L.push(`- Direct Booking Link: https://numberwale.com/cart-add/${tp.number}`);
      L.push('');
      L.push('STRICT MANDATORY RULES FOR THIS INQUIRY:');
      L.push('1. THIS IS ONE SINGLE 10-DIGIT NUMBER. NEVER SPLIT IT INTO TWO NUMBERS (e.g. NEVER treat "8574 113322" as 8574 and 113322)! NEVER say "dono numbers" or "combined amount"!');
      L.push(`2. The price is EXACTLY ${priceGst} (including 18% GST). NEVER hallucinate, guess, or invent any other price!`);
      if (ctx && ctx.activeCoupon) {
        const ac = ctx.activeCoupon;
        const discountText = ac.discountType === 'percentage' ? `${ac.discountValue}% extra discount` : `₹${ac.discountValue} flat extra discount`;
        const minNote = ac.minOrderValue > 0 ? ` (valid on cart value above ₹${ac.minOrderValue.toLocaleString('en-IN')})` : '';
        L.push('3. If customer asks about price, final rate, discount, or negotiations ("kitna final hoga", "best price", "discount", "kam karo"):');
        if (lang === 'English') {
          L.push(`   - Explain in English that ${priceGst} is already up to 50% discounted on Numberwale.`);
          L.push(`   - BUT warmly offer them our exclusive coupon code: *${ac.code}* for ${discountText}${minNote} on checkout cart!`);
          L.push(`   - Instruct them to click the booking link and apply coupon *${ac.code}* in cart to claim the savings.`);
        } else {
          L.push(`   - Explain that ${priceGst} is already up to 50% discounted on Numberwale.`);
          L.push(`   - BUT warmly offer them our exclusive coupon code: *${ac.code}* for ${discountText}${minNote} on checkout cart!`);
          L.push(`   - Tell them to click the booking link and enter coupon *${ac.code}* in cart to apply the discount.`);
        }
      } else {
        L.push('3. If customer asks about price, final rate, discount, or negotiations ("kitna final hoga", "best price", "discount", "kam karo"):');
        if (lang === 'English') {
          L.push(`   Explain warmly in English that ${priceGst} is already our best direct discounted price on Numberwale, complete with 18% GST invoice and 100% money-back guarantee.`);
        } else {
          L.push(`   Explain warmly that ${priceGst} is already our best direct discounted price on Numberwale, complete with 18% GST invoice and 100% money-back guarantee.`);
        }
      }
      L.push(`4. Share the direct reservation link to book the number: https://numberwale.com/cart-add/${tp.number}`);
      L.push('5. Do NOT output SEARCH_JSON when customer is asking about this specific number, unless they ask to see other numbers.');
    }
  }

  if (ctx && ctx.activeCoupon) {
    const ac = ctx.activeCoupon;
    const discountText = ac.discountType === 'percentage'
      ? `${ac.discountValue}% OFF`
      : `₹${ac.discountValue} FLAT OFF`;
    const minText = ac.minOrderValue > 0 ? ` on cart value above ₹${ac.minOrderValue.toLocaleString('en-IN')}` : '';
    const maxText = ac.maxDiscount ? ` (up to ₹${ac.maxDiscount.toLocaleString('en-IN')})` : '';

    L.push('');
    L.push('## ACTIVE EXCLUSIVE DISCOUNT COUPON (USE WHEN CUSTOMER ASKS FOR DISCOUNT / NEGOTIATION / OFFERS)');
    L.push(`- Active Coupon Code: *${ac.code}*`);
    L.push(`- Offer: ${discountText}${minText}${maxText}`);
    L.push('- How it works: Applied in website cart during checkout');
    L.push('');
    L.push('WHEN CUSTOMER ASKS ABOUT DISCOUNT, "BEST PRICE", "FINAL PRICE", "OFFERS", "COUPON", "KAM KARO":');
    if (lang === 'English') {
      L.push(`1. In English, warmly present this exclusive coupon code (*${ac.code}*) so they get extra direct savings (${discountText})!`);
      L.push('2. Mention that website prices are already up to 50% off, but this coupon gives them an extra special discount.');
      L.push(`3. Provide the booking / cart link and explain that they can enter coupon code *${ac.code}* in the cart to see the discounted total.`);
    } else {
      L.push(`1. Warmly present this exclusive coupon code (*${ac.code}*) so they get extra direct savings (${discountText})!`);
      L.push('2. Explain that website prices are already up to 50% discounted, but this coupon gives them an extra special discount.');
      L.push(`3. Provide the booking / cart link and explain that they can enter coupon code *${ac.code}* in the cart to see the discounted total.`);
    }
  }

  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// TIER 1: GROQ DYNAMIC MODEL DISCOVERY (free, ~500ms)
// ─────────────────────────────────────────────────────────────────
let cachedGroqModels = null;
let lastGroqFetchTime = 0;

async function getAvailableGroqModels(apiKey) {
  const now = Date.now();
  // Cache model list for 30 minutes
  if (cachedGroqModels && cachedGroqModels.length > 0 && (now - lastGroqFetchTime < 1000 * 60 * 30)) {
    return cachedGroqModels;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        const textModels = data.data
          .map(m => m.id)
          .filter(id => {
            const lower = id.toLowerCase();
            return !lower.includes('whisper') &&
                   !lower.includes('guard') &&
                   !lower.includes('tts') &&
                   !lower.includes('embed') &&
                   !lower.includes('distil');
          });

        if (textModels.length > 0) {
          // Sort models: prioritize known strong conversational models
          textModels.sort((a, b) => {
            const score = (id) => {
              const l = id.toLowerCase();
              if (l.includes('120b')) return 1;
              if (l.includes('70b')) return 2;
              if (l.includes('27b')) return 3;
              if (l.includes('20b')) return 4;
              if (l.includes('8b')) return 5;
              if (l.includes('llama')) return 6;
              return 10;
            };
            return score(a) - score(b);
          });

          cachedGroqModels = textModels;
          lastGroqFetchTime = now;
          console.log('[Agent] 🟢 Discovered active Groq models for key:', cachedGroqModels.slice(0, 4));
          return cachedGroqModels;
        }
      }
    }
  } catch (err) {
    console.warn('[Agent] Could not query Groq models endpoint:', err.message);
  }

  // Fallbacks if discovery API fails
  return ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
}

async function callGroq(systemPrompt, messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_GROQ_KEY');

  const models = await getAvailableGroqModels(apiKey);
  let lastError = null;

  // Try top 4 available models in sequence
  for (const model of models.slice(0, 4)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.4,
          max_tokens: 900,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const error = new Error((errData && errData.error && errData.error.message) || response.statusText);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      return { text: text.trim(), model: 'groq/' + model };
    } catch (err) {
      lastError = err;
      console.warn(`[Agent] Groq model ${model} failed (${err.message}). Trying next available model...`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All Groq models failed');
}

// ─────────────────────────────────────────────────────────────────
// TIER 2: OPENAI (paid fallback)
// ─────────────────────────────────────────────────────────────────
async function callOpenAI(systemPrompt, messages, model) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
  if (!apiKey) throw new Error('NO_OPENAI_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.4,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const error = new Error((errData && errData.error && errData.error.message) || response.statusText);
      error.status = response.status;
      error.code = errData?.error?.code;
      throw error;
    }

    const data = await response.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return { text: text.trim(), model: model || 'gpt-4o-mini' };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// LOAD-BALANCED CALL: Groq first, OpenAI fallback
// ─────────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, messages) {
  // 1. Try Groq first (free, fast)
  try {
    const result = await callGroq(systemPrompt, messages);
    console.log('[Agent] ⚡ Groq success:', result.model);
    return result;
  } catch (groqErr) {
    if (groqErr.message === 'NO_GROQ_KEY') {
      console.log('[Agent] No GROQ_API_KEY set, falling back to OpenAI...');
    } else {
      console.warn('[Agent] ⚠️ Groq failed (' + groqErr.message + '), falling back to OpenAI...');
    }
  }

  // 2. Fallback to OpenAI
  try {
    const result = await callOpenAI(systemPrompt, messages, 'gpt-4o-mini');
    console.log('[Agent] ✅ OpenAI gpt-4o-mini success');
    return result;
  } catch (oaiErr) {
    if (oaiErr.status === 429 && !oaiErr.message.toLowerCase().includes('credit')) {
      console.warn('[Agent] gpt-4o-mini rate limited, trying gpt-4o...');
      try {
        const result = await callOpenAI(systemPrompt, messages, 'gpt-4o');
        console.log('[Agent] ✅ OpenAI gpt-4o success');
        return result;
      } catch (err2) {
        throw err2;
      }
    }
    throw oaiErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// FORMAT PRODUCTS
// ─────────────────────────────────────────────────────────────────
export function formatProductNumberForWhatsApp(p) {
  if (!p) return 'N/A';

  // 1. Check customDesignProductMobileNumber from database (e.g. 967-*167*-72-*167*)
  const custom = p.customDesignProductMobileNumber;
  if (custom && typeof custom === 'string' && custom.trim()) {
    const cleaned = custom
      .replace(/\*/g, '')         // Remove all * asterisks
      .replace(/-/g, ' ')         // Replace - hyphens with space
      .replace(/\s+/g, ' ')       // Collapse multiple spaces
      .trim();
    if (cleaned.length >= 10) {
      return cleaned;
    }
  }

  // 2. Check if productMobileNumber itself contains formatting (* or -)
  const rawNum = String(p.productMobileNumber || '');
  if (rawNum.includes('*') || rawNum.includes('-')) {
    const cleaned = rawNum
      .replace(/\*/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 10) {
      return cleaned;
    }
  }

  // 3. Fallback: 5-5 split for standard 10-digit numbers
  const d = rawNum.replace(/\D/g, '');
  if (d.length === 10) {
    return `${d.slice(0, 5)} ${d.slice(5)}`;
  }

  return rawNum || 'N/A';
}

export function formatProducts(products, totalCount, currentPage, totalPages, lang) {
  if (!products || products.length === 0) return null;

  const numEmoji = ['1\u20E3','2\u20E3','3\u20E3','4\u20E3','5\u20E3','6\u20E3','7\u20E3','8\u20E3','9\u20E3','\uD83D\uDD1F'];
  const lines = [];

  products.forEach(function(p, idx) {
    const raw = p.productMobileNumber || 'N/A';
    const cleanDigits = String(raw).replace(/\D/g, '');
    const formatted = formatProductNumberForWhatsApp(p);
    const price = p.pricing && p.pricing.nwFinalPrice;
    const basePrice = p.pricing && p.pricing.nwBasePrice && p.pricing.nwBasePrice.inr;
    const discount = (p.pricing && p.pricing.nwMyDiscount) || (p.vendor && p.vendor.vendorDiscount) || 0;
    const catName = (p.category && p.category.name) || 'VIP Fancy Number';
    const score = (p.score != null) ? p.score : null;

    lines.push((numEmoji[idx] || (idx + 1) + '.') + ' *' + formatted + '* \uD83D\uDC51');
    lines.push('   \uD83D\uDCC1 ' + catName);

    if (price) {
      const withGst = price + Math.round(price * 0.18);
      if (discount > 0 && basePrice) {
        lines.push('   \uD83D\uDCB0 ~\u20B9' + Number(basePrice).toLocaleString('en-IN') + '~ *\u20B9' + withGst.toLocaleString('en-IN') + '* (' + discount + '% OFF, incl. GST)');
      } else {
        lines.push('   \uD83D\uDCB0 *\u20B9' + withGst.toLocaleString('en-IN') + '* (incl. 18% GST)');
      }
    }

    if (score !== null) lines.push('   \uD83D\uDD2E Lucky Sum: *' + score + '*');
    lines.push('   \uD83D\uDC49 Book: _buy ' + (cleanDigits || raw) + '_');
    lines.push('');
  });

  let footer;
  if (lang === 'Gujarati') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 વધુ જોવા માટે \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 નવી સર્ચ \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 કન્સલ્ટન્ટ સાથે વાત \u2192 reply *"agent"* અથવા કૉલ *9222 222 007*';
  } else if (lang === 'Marathi') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 अजून पाहण्यासाठी \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 नवीन शोध \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 प्रतिनिधीशी संपर्क \u2192 reply *"agent"* किंवा कॉल करा *9222 222 007*';
  } else if (lang === 'Hindi') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 और देखने के लिए \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 नई खोज \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 सहायता के लिए \u2192 reply *"agent"* या कॉल करें *9222 222 007*';
  } else if (lang === 'English') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 To see more \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 New search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human consultant \u2192 reply *"agent"* or call *9222 222 007*';
  } else {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 Aur dekhne ke liye \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 Nayi search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human agent \u2192 reply *"agent"* ya call *9222 222 007*';
  }

  return lines.join('\n') + footer;
}

function extractSearchJSON(text) {
  const match = text.match(/SEARCH_JSON:(\{[^]*?\})(?:\s*\n|$)/);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[1]);
    if (raw.category && !VALID_CATEGORIES.includes(raw.category)) {
      console.log('[Agent] Stripped invalid category: ' + raw.category);
      delete raw.category;
    }
    Object.keys(raw).forEach(function(k) {
      if (raw[k] === null || raw[k] === undefined || raw[k] === '') delete raw[k];
    });
    return raw;
  } catch (e) {
    console.error('[Agent] Failed to parse SEARCH_JSON:', match[1], e.message);
    return undefined;
  }
}

function cleanMarkdownTables(text) {
  if (!text || !text.includes('|')) return text;
  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip markdown table divider rows like |---|---| or |:---:|
    if (/^\|?\s*[-:]+[-|\s:]*\|?$/.test(line)) {
      continue;
    }
    // Convert table rows with pipes | Col1 | Col2 |
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length > 0) {
        const firstLower = cells[0].toLowerCase();
        // Skip table headers like "Number | Meaning"
        if (firstLower === 'number' || firstLower === 'item' || firstLower === 'col' || firstLower === 'title' || firstLower === 'parameter') {
          continue;
        }
        if (cells.length >= 2) {
          result.push(`• *${cells[0]}:* ${cells.slice(1).join(' — ')}`);
        } else {
          result.push(`• ${cells[0]}`);
        }
        continue;
      }
    }
    result.push(lines[i]);
  }
  return result.join('\n');
}

function stripSearchJSON(text) {
  return text.replace(/SEARCH_JSON:\{[^]*?\}\s*\n?/g, '').trim();
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────
export async function runAgent(opts) {
  const userMessage = opts.userMessage;
  const customerContext = opts.customerContext || {};
  const page = opts.page || 1;
  const detectedLang = detectLanguage(userMessage, customerContext.language || 'English');
  customerContext.language = detectedLang;
  const lang = detectedLang;
  const history = (customerContext && customerContext.history) || [];

  // Check if current user message shares DOB
  const parsedDOB = parseDOB(userMessage);
  if (parsedDOB) {
    customerContext.dob = parsedDOB.dobStr;
    customerContext.birthNumber = parsedDOB.birthNumber;
    customerContext.lifePathNumber = parsedDOB.lifePathNumber;
    customerContext.justSharedDOB = true;
  }

  // Check if message inquires about a specific 10-digit mobile number
  const detected10Digit = extract10DigitNumber(userMessage);
  if (detected10Digit) {
    try {
      const prod = await fetchProductByNumber(detected10Digit);
      if (prod) {
        const subtotal = prod.price || prod.basePrice || 0;
        const totalWithGst = subtotal ? subtotal + Math.round(subtotal * 0.18) : null;
        customerContext.targetProduct = {
          number: prod.number,
          price: prod.price,
          basePrice: prod.basePrice,
          category: prod.category,
          totalWithGst: totalWithGst,
          formattedNumber: formatProductNumberForWhatsApp({ productMobileNumber: prod.number }),
          cartLink: `https://numberwale.com/cart-add/${prod.number}`
        };
        console.log(`[Agent] Injected targetProduct: ${prod.number} (Price with GST: ₹${totalWithGst})`);
      } else {
        customerContext.targetProduct = {
          number: detected10Digit,
          notFound: true,
          formattedNumber: `${detected10Digit.slice(0, 5)} ${detected10Digit.slice(5)}`
        };
        console.log(`[Agent] Target number ${detected10Digit} not found in inventory.`);
      }
    } catch (fetchErr) {
      console.warn('[Agent] Could not fetch target number details:', fetchErr.message);
    }
  }

  // Fetch active promotional coupon for WhatsApp Bot (cached 5 min)
  try {
    const activeCoupon = await fetchActiveBotCoupon();
    if (activeCoupon) {
      customerContext.activeCoupon = activeCoupon;
      console.log(`[Agent] Active bot coupon loaded: ${activeCoupon.code} (${activeCoupon.discountValue}${activeCoupon.discountType === 'percentage' ? '%' : ' INR'})`);
    } else {
      customerContext.activeCoupon = null;
    }
  } catch (couponErr) {
    console.warn('[Agent] Could not load bot coupon:', couponErr.message);
  }

  // Build conversation history for LLM
  const messages = history.slice(-8).map(function(h) {
    return { role: h.role === 'bot' ? 'assistant' : 'user', content: h.text };
  });
  messages.push({ role: 'user', content: userMessage });

  const systemPrompt = buildSystemPrompt(customerContext);

  let llmResult;
  try {
    llmResult = await callLLM(systemPrompt, messages);
  } catch (err) {
    console.error('[Agent] All LLM slots failed:', err.message);
    let fallbackReply;
    if (lang === 'English') {
      fallbackReply = "Sorry, I'm having a brief technical issue. Please try again in a moment or call *+91 9222 222 007*. \uD83D\uDE4F";
    } else if (lang === 'Hindi') {
      fallbackReply = "माफ़ी चाहता हूँ, अभी थोड़ी तकनीकी समस्या है। कृपया थोड़ी देर बाद पुनः प्रयास करें या *9222 222 007* पर कॉल करें। \uD83D\uDE4F";
    } else if (lang === 'Gujarati') {
      fallbackReply = "માફ કરશો, અત્યારે થોડી તકનીકી સમસ્યા છે. કૃપા કરીને થોડીવાર પછી ફરી પ્રયાસ કરો અથવા *9222 222 007* પર કૉલ કરો. \uD83D\uDE4F";
    } else if (lang === 'Marathi') {
      fallbackReply = "क्षमस्व, सध्या थोडी तांत्रिक अडचण आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा किंवा *9222 222 007* वर कॉल करा. \uD83D\uDE4F";
    } else {
      fallbackReply = "Oops! Abhi thodi technical dikkat hai. Thodi der baad try karo ya *9222 222 007* pe call karo. \uD83D\uDE4F";
    }
    return { reply: fallbackReply, conversationalIntro: fallbackReply, searchJSON: null, model: 'fallback', escalate: false };
  }

  const agentText = llmResult.text;
  const usedModel = llmResult.model;

  console.log('[Agent] Raw (' + usedModel + '):', agentText.substring(0, 500));

  const searchJSON = extractSearchJSON(agentText);
  let conversationalText = cleanMarkdownTables(stripSearchJSON(agentText));
  const conversationalIntro = conversationalText;

  if (searchJSON !== undefined) {
    console.log('[Agent] Searching with:', JSON.stringify(searchJSON));
    try {
      const result = await fetchNumbers(searchJSON, page);
      const productsBlock = formatProducts(
        result.products, result.totalCount, result.currentPage, result.totalPages, lang
      );
      if (productsBlock) {
        conversationalText = conversationalText
          ? (conversationalText + '\n\n' + productsBlock)
          : productsBlock;
        return {
          reply: conversationalText,
          conversationalIntro: conversationalIntro,
          searchJSON: searchJSON,
          model: usedModel,
          escalate: false,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          currentPage: result.currentPage,
        };
      } else {
        let noResults;
        if (lang === 'English') {
          noResults = '\n\n\uD83D\uDE14 No numbers found for this exact search right now. Try adjusting budget or pattern!';
        } else if (lang === 'Hindi') {
          noResults = '\n\n\uD83D\uDE14 इस सर्च के लिए अभी कोई नंबर उपलब्ध नहीं है। कृपया बजट या पैटर्न थोड़ा बदलकर देखें!';
        } else if (lang === 'Gujarati') {
          noResults = '\n\n\uD83D\uDE14 આ સર્ચ માટે અત્યારે કોઈ નંબર મળ્યો નથી. કૃપા કરીને બજેટ અથવા પેટર્ન થોડું બદલીને જુઓ!';
        } else if (lang === 'Marathi') {
          noResults = '\n\n\uD83D\uDE14 या शोधासाठी सध्या कोणताही नंबर उपलब्ध नाही. कृपया बजेट किंवा पॅटर्न थोडा बदलून पहा!';
        } else {
          noResults = '\n\n\uD83D\uDE14 Is exact search se koi number nahi mila. Budget thoda badhao ya pattern change karo!';
        }
        conversationalText = conversationalText + noResults;
        return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: searchJSON, model: usedModel, escalate: false };
      }
    } catch (searchErr) {
      console.error('[Agent] Search failed:', searchErr.message);
    }
  }

  return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: null, model: usedModel, escalate: false };
}
