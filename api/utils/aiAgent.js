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
import { fetchProductByNumber, fetchActiveBotCoupon, fetchActiveBotCoupons } from './paymentUtils.js';
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

export function getOfficeHoursStatus() {
  const now = new Date();
  const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istString);
  const day = istDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const isSunday = (day === 0);
  const isOpen = !isSunday && (currentMinutes >= 10 * 60 && currentMinutes < 19 * 60); // 10:00 AM to 7:00 PM

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedTime = istDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return {
    isOpen,
    isSunday,
    currentDay: dayNames[day],
    currentTime: formattedTime,
    schedule: "10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays)"
  };
}

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
  L.push('6. 🚨 NEVER invent, generate, hallucinate, or write phone numbers in your conversational text (e.g. NEVER write "• 112 112 – ₹19,980" or "• 334 334" or "• 98765 43210")! All numbers and prices come exclusively from live inventory and are attached by the system via SEARCH_JSON.');
  L.push('7. 🚨 NEVER mention coupons, promo codes, or extra discounts UNLESS the customer specifically and explicitly asks for a discount, offer, concession, cheaper price, or best price!');
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
  const officeStatus = (ctx && ctx.testOfficeStatus) || getOfficeHoursStatus();
  L.push('## OFFICE HOURS & STRICT CALLING POLICY');
  L.push('- Official Office Hours: 10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays).');
  L.push(`- Current IST Time: ${officeStatus.currentDay}, ${officeStatus.currentTime}.`);
  L.push(`- Office Current Status: ${officeStatus.isOpen ? '🟢 OPEN (Helpline Active: 10am to 7pm)' : '🔴 CLOSED (AFTER OFFICE HOURS — PHONE CALLS CANNOT BE ANSWERED)'}.`);
  L.push('- CRITICAL CALLING POLICY:');
  if (officeStatus.isOpen) {
    L.push('  • Helpline +91 9222 222 007 is active right now (10:00 AM to 7:00 PM, Mon–Sat).');
    L.push('  • If customer wants to speak with an agent or call: "Aap hamare helpline *+91 9222 222 007* par call kar sakte hain (10am–7pm)! 😊"');
  } else {
    L.push('  • 🚨 OFFICE IS CURRENTLY CLOSED! Phone calls CANNOT be answered right now.');
    L.push('  • If customer asks to call, speak to an agent/manager, or requests a callback:');
    L.push('    1. State clearly that our office hours are 10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays).');
    L.push('    2. Politely explain that calls cannot be answered after office hours.');
    L.push('    3. Reassure them that you (Eva) are available 24/7 on WhatsApp chat to answer all questions and help them find/book numbers right now!');
    L.push('    4. Promise that our team will gladly connect or call them back as soon as the office opens at 10:00 AM.');
  }
  L.push('');
  L.push('## NUMBERWALE FACTS (use strictly, never guess)');
  L.push('- Founded 2010 | 1 Lakh+ clients | Helpline: +91 9222 222 007 | support@numberwale.com');
  L.push('- Office: Bhayandar East, Thane/Mumbai, Maharashtra 401105 (Working Hours: 10:00 AM to 7:00 PM, Mon–Sat)');
  L.push('- Networks: All operators (Jio, Airtel, Vi, BSNL) | 4G/5G | Prepaid or Postpaid | eSIM convertible');
  L.push('- Payment: UPI / Cards / NetBanking / Credit Card EMI | NO COD (UPC is digital delivery)');
  L.push('- Guarantee: 100% Money-Back if porting fails | Fresh UPC free if expired within validity');
  L.push('- Pricing: 18% GST included, official GST invoice provided | Business buyers can claim ITC');
  L.push('- Discounts: Website prices are already direct wholesale discounted up to 50% off.');
  L.push('');
  L.push('## 🚨 PORTING, MNP & UPC SUPPORT — 100% ONE-STOP SOLUTION (STRICT RULE)');
  L.push('1. 🛑 NEVER, UNDER ANY CIRCUMSTANCE, TELL THE CUSTOMER TO CONTACT THE TELECOM OPERATOR CUSTOMER CARE (Jio/Airtel/Vi/BSNL care)! Telecom operators do NOT manage Numberwale bookings, invoices, or UPC generation.');
  L.push('2. Numberwale is the customer\'s ONE-STOP SOLUTION for everything.');
  L.push('3. If customer reports ANY issue (MNP rejected, UPC code not received, UPC expired, store facing issue, porting delay, payment query):');
  L.push('   - Assure them with complete confidence: "Aapko kisi bhi operator ke customer care mein call karne ki bilkul zarurat nahi hai. Numberwale aapka One-Stop Solution hai!"');
  L.push('   - If UPC expires: Numberwale generates a fresh new UPC code completely FREE of charge.');
  L.push('   - If porting fails for any reason: Numberwale provides a fresh UPC or a 100% money-back refund guarantee.');
  L.push('   - Instruct them to connect directly with Numberwale on WhatsApp or call +91 9222 222 007 (10am–7pm Mon–Sat) / support@numberwale.com.');
  L.push('');
  L.push('## ACCURATE STEP-BY-STEP UPC & ACTIVATION PROCESS');
  L.push('When explaining the porting / MNP / activation process to the customer, use this exact 4-step framework:');
  L.push('Intro: "Your purchased VIP mobile number can be activated with any telecom operator (Jio, Airtel, Vi or BSNL; BSNL subject to availability) anywhere in India through Mobile Number Portability (MNP). A Unique Porting Code (UPC) is mandatory to activate your VIP mobile number through the MNP process."');
  L.push('1️⃣ Order Confirmation: Once your payment is confirmed, the UPC generation process begins.');
  L.push('2️⃣ UPC Generation: The UPC will be shared with you via SMS within 24 working hours. The UPC is valid for a limited period, so please make sure to submit your MNP request at least 1 day before expiration.');
  L.push('3️⃣ Visit a Store: Carry your original Aadhaar Card and the UPC. Visit any official telecom operator store OR nearby local mobile store to complete the MNP request and collect your SIM. (For postpaid connections, please visit an official operator store).');
  L.push('4️⃣ Number Activation: The number will be activated as per the operator\'s standard MNP timeline (typically 3 to 5 business days nationwide).');
  L.push('');
  L.push('## ⚡ INSTANT ACTIVATION (DFO) vs ALL-INDIA RTP NUMBERS');
  L.push('Numberwale offers two distinct types of VIP numbers:');
  L.push('1. 🌐 All-India RTP / CRTP Numbers:');
  L.push('   - Works in ALL states across India with ANY operator (Jio, Airtel, Vi, BSNL).');
  L.push('   - Activated via standard MNP in 3-5 business days using UPC code.');
  L.push('2. ⚡ Instant Activation Numbers (Direct From Operator - DFO):');
  L.push('   - Activates instantly within 5 to 10 minutes (no waiting 3-5 days for MNP!).');
  L.push('   - 🚨 CRITICAL: Instant Activation numbers are STATE-SPECIFIC (e.g. Maharashtra, Gujarat, Assam, Karnataka, Bihar, Mumbai circle).');
  L.push('   - 🚨 MANDATORY 2-3 TIMES STATE VERIFICATION RULE:');
  L.push('     Whenever you present or discuss an Instant Activation number with a customer, you MUST explicitly remind them 2 to 3 times to verify their state proof:');
  L.push('     • Reminder 1: Mention that this number has instant 5-10 minute activation for [State] circle.');
  L.push('     • Reminder 2: Clarify that they must have Aadhaar / address proof of [State] to activate it.');
  L.push('     • Reminder 3: Warn them that if they are NOT from [State] or do not have [State] address proof, they CANNOT activate this number and should choose an All-India RTP number instead!');
  L.push('');
  L.push('## 🚨 PAYMENT LINK & BOOKING LINK POLICY (STRICT RULE)');
  L.push('When customer asks for a payment link ("payment link bhejo", "pay kaise karu", "link do", "checkout link", "online pay karna hai"):');
  L.push('1. IF customer has already selected / specified a 10-digit number (or targetProduct is active):');
  L.push('   - Provide the exact direct cart booking link: https://numberwale.com/cart-add/<10-digit-number>');
  L.push('   - Warmly explain that they can open the link, review the order, apply any coupon, and complete payment securely via UPI, Cards, NetBanking, or EMI.');
  L.push('2. IF customer has NOT selected or specified a number yet:');
  L.push('   - 🛑 NEVER send a generic, broken, or blank payment link! (NEVER send /cart-add/ without a number).');
  L.push('   - Politely and warmly explain: "Payment link ke liye kripya pehle apna pasandeeda VIP number choose/select kar lijiye. Jaise hi aap koi number select karenge, main turant uska direct booking link aapko share kar dungi! 😊"');
  L.push('   - Offer to show numbers matching their preference or budget.');
  L.push('');
  L.push('## 📄 INVOICE & NUMEROLOGY REPORT DOWNLOAD INSTRUCTIONS (STRICT RULE)');
  L.push('When customer asks how or where to access/download their invoice, bill, receipt, or numerology report:');
  L.push('1. 📄 Official GST Invoice / Bill / Order Receipt:');
  L.push('   - Clearly guide them: Website (https://www.numberwale.com) par login karke *My Account > My Orders* me jaa kar aap apna official 18% GST Invoice download kar sakte hain.');
  L.push('   - Mention that every purchase includes an official GST tax invoice which can be used to claim Input Tax Credit (ITC) for business purposes.');
  L.push('2. 🔮 Numerology Report:');
  L.push('   - Clearly guide them: Website par login karke *My Account > Numerology Report* me jaa kar aap apna personalized Numerology Report dekh aur download kar sakte hain.');
  L.push('   - (And the GST invoice for the report is also available under *My Account > My Orders*).');
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
  L.push('BUDGET vs LUXURY CATEGORY CONFLICT:');
  L.push('- High-end patterns like "mirror-numbers", "hexa-numbers", "penta-numbers", "octa-numbers" start at ₹1,00,000+.');
  L.push('- If customer specifies a budget under ₹50,000 (e.g. "20000 me", "budget 15000", "under 30k"), NEVER combine narrow luxury categories like "mirror-numbers" into SEARCH_JSON!');
  L.push('- Instead, search within budget: SEARCH_JSON:{"maxPrice":20000} or recommend accessible categories like SEARCH_JSON:{"category":"doubling-numbers","maxPrice":20000}.');
  L.push('');
  L.push('INSTANT ACTIVATION & STATE-SPECIFIC (DFO) FILTERS:');
  L.push('- "isDirectFromOperator": "true" (use when customer specifically asks for instant 5-10 min activation numbers)');
  L.push('- "operatorState": state name e.g. "Maharashtra", "Gujarat", "Assam", "Karnataka", "Bihar", "Mumbai" (used with isDirectFromOperator)');
  L.push('');
  if (af) {
    L.push('CURRENT ACTIVE SEARCH FILTERS: ' + af);
    L.push('- REFINEMENT: Merge new constraint with active filters UNLESS there is a conflict (e.g. customer specifies a budget under 50k like "20000 me" after a luxury category like mirror-numbers -> DISCARD the luxury category and search within requested budget).');
    L.push('- NEW SEARCH (different pattern/category or broad budget request): DISCARD active filters, output only new JSON.');
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
      const targetCoupons = (ctx && ctx.activeCoupons && ctx.activeCoupons.length > 0)
        ? ctx.activeCoupons
        : (ctx && ctx.activeCoupon ? [ctx.activeCoupon] : []);

      if (targetCoupons.length > 0) {
        // Pick best coupon for this specific target number
        const bestCoupon = targetCoupons.find(c => tp.totalWithGst >= (c.minOrderValue || 0)) || targetCoupons[0];
        const discountText = bestCoupon.discountType === 'percentage' ? `${bestCoupon.discountValue}% extra discount` : `₹${bestCoupon.discountValue} flat extra discount`;
        const minNote = bestCoupon.minOrderValue > 0 ? ` (valid on cart value above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')})` : '';
        L.push('3. If customer asks about price, final rate, discount, or negotiations ("kitna final hoga", "best price", "discount", "kam karo"):');
        if (lang === 'English') {
          L.push(`   - Explain in English that ${priceGst} is already direct wholesale discounted on Numberwale.`);
          L.push(`   - BUT warmly offer them our exclusive coupon code: *${bestCoupon.code}* for ${discountText}${minNote} on checkout cart!`);
          L.push(`   - Instruct them to click the booking link and apply coupon *${bestCoupon.code}* in cart to claim the savings.`);
        } else {
          L.push(`   - Explain that ${priceGst} is already direct wholesale discounted on Numberwale.`);
          L.push(`   - BUT warmly offer them our exclusive coupon code: *${bestCoupon.code}* for ${discountText}${minNote} on checkout cart!`);
          L.push(`   - Tell them to click the booking link and enter coupon *${bestCoupon.code}* in cart to apply the discount.`);
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

  const botCoupons = (ctx && ctx.activeCoupons && ctx.activeCoupons.length > 0)
    ? ctx.activeCoupons
    : (ctx && ctx.activeCoupon ? [ctx.activeCoupon] : []);

  if (botCoupons.length > 0) {
    L.push('');
    L.push('## 🚨 STRICT COUPON RULES (CRITICAL — READ CAREFULLY!)');
    L.push('1. NEVER EVER mention coupon codes, promo codes, or extra discounts UNLESS the customer specifically and explicitly asks for a discount, concession, deal, cheaper price, or best price ("discount hai kya", "kam karo", "best price", "offers kya hai", "koi coupon code hai?").');
    L.push('2. On greetings, normal number searches, category recommendations, or numerology discussions: NEVER mention coupon codes! Keep focus 100% on the numbers and customer requirements.');
    L.push('3. When (and ONLY when) customer asks for discount, best price, or negotiation:');
    L.push('   Offer the following exclusive coupon codes according to their order value:');
    botCoupons.forEach(c => {
      const disc = c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `₹${c.discountValue} FLAT OFF`;
      const minCond = c.minOrderValue > 0 ? `(Valid on cart value above ₹${Number(c.minOrderValue).toLocaleString('en-IN')})` : `(Valid on any cart value — No minimum order)`;
      L.push(`   • Code *${c.code}*: ${disc} ${minCond}`);
    });
    L.push('   Rules for selecting coupon:');
    L.push('   - If customer\'s selected number or budget is ₹5,000 or more: recommend *SPECIAL200* for ₹200 instant savings!');
    L.push('   - If customer\'s order or budget is below ₹5,000: recommend *SPECIAL75* for ₹75 instant savings!');
    L.push('   - If general inquiry ("any discount?"): warmly share both options so they know they get discounts at every price point!');
    if (lang === 'English') {
      L.push('   - Explain politely: "Our website prices are already up to 50% discounted, but you can apply coupon *[CODE]* at checkout for extra direct savings!"');
    } else if (lang === 'Hindi') {
      L.push('   - Explain politely: "हमारी वेबसाइट पर कीमतें पहले से ही 50% तक कम हैं, लेकिन आप चेकआउट के समय कूपन कोड *[CODE]* लगाकर अतिरिक्त छूट प्राप्त कर सकते हैं!"');
    } else {
      L.push('   - Explain politely: "Hamari website par rates already up to 50% discounted hain, par aapke liye special coupon code *[CODE]* hai jisse aapko checkout cart mein extra discount mil jayega!"');
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

    if (p.isDirectFromOperator) {
      const stateStr = p.operatorState ? `${p.operatorState} Circle` : 'State-Specific';
      const providerStr = p.operatorProvider ? ` (${p.operatorProvider})` : '';
      lines.push(`   ⚡ *Instant 5-Min Activation* — ${stateStr}${providerStr}`);
      lines.push(`   ⚠️ _Note: Valid ONLY for ${p.operatorState || 'this state'} address proof residents!_`);
    } else if (p.readyToPort) {
      const rtpStr = p.readyToPort === 'rtp' ? 'Ready to Port' : 'Cond. RTP';
      lines.push(`   🌐 *All-India MNP* (${rtpStr} — Any Operator/State)`);
    }

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
      + '\uD83D\uDD39 કન્સલ્ટન્ટ સાથે વાત \u2192 reply *"agent"* અથવા કૉલ *9222 222 007* (10am–7pm Mon–Sat)';
  } else if (lang === 'Marathi') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 अजून पाहण्यासाठी \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 नवीन शोध \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 प्रतिनिधीशी संपर्क \u2192 reply *"agent"* किंवा कॉल करा *9222 222 007* (10am–7pm सोम–शनि)';
  } else if (lang === 'Hindi') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 और देखने के लिए \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 नई खोज \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 सहायता के लिए \u2192 reply *"agent"* या कॉल करें *9222 222 007* (10am–7pm Mon–Sat)';
  } else if (lang === 'English') {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 To see more \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 New search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human consultant \u2192 reply *"agent"* or call *9222 222 007* (10am–7pm Mon–Sat)';
  } else {
    footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 Aur dekhne ke liye \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 Nayi search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human agent \u2192 reply *"agent"* ya call *9222 222 007* (10am–7pm Mon–Sat)';
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
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return cleaned.replace(/SEARCH_JSON:\{[^]*?\}\s*\n?/g, '').trim();
}

export function formatCategoryName(cat) {
  if (!cat) return 'VIP Numbers';
  return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function sanitizeHallucinatedNumbers(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    // Match bullet or numbered list prefix: e.g. "• ", "- ", "* ", "1. ", "1) "
    const bulletMatch = trimmed.match(/^[\s\u2022\u25aa\u25b6\u25c6\u25cf•\-\*]+|^\s*\d{1,2}[\.\)]\s*/u);
    if (!bulletMatch) return true;
    
    const afterBullet = trimmed.slice(bulletMatch[0].length).trim();
    // Check if after bullet there is a sequence of digits like "112 112" or "9876543210" or "786 110" or a fake price
    const hasNumberListing = /^\*?[0-9]{2,5}[\s\-]?[0-9]{2,5}/.test(afterBullet) || 
                             /^\*?[6-9]\d{9}/.test(afterBullet) ||
                             /(?:₹|rs\.?|inr)\s*[\d,]+/i.test(afterBullet);
    if (hasNumberListing) {
      return false;
    }
    return true;
  });
  
  let res = filtered.join('\n');
  // Clean empty header lines left hanging
  res = res.replace(/(?:^|\n)[^\n]+(?:top picks|suggested numbers|picks|options|series)[^\n]*:\s*(?=\n\s*\n|\s*$)/gi, '');
  return res.trim();
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

  // Fetch active promotional coupons for WhatsApp Bot (cached 5 min)
  try {
    const activeCoupons = await fetchActiveBotCoupons();
    if (activeCoupons && activeCoupons.length > 0) {
      customerContext.activeCoupons = activeCoupons;
      customerContext.activeCoupon = activeCoupons[0];
      console.log(`[Agent] Active bot coupons loaded (${activeCoupons.length}):`, activeCoupons.map(c => c.code).join(', '));
    } else {
      customerContext.activeCoupons = [];
      customerContext.activeCoupon = null;
    }
  } catch (couponErr) {
    console.warn('[Agent] Could not load bot coupons:', couponErr.message);
    customerContext.activeCoupons = [];
    customerContext.activeCoupon = null;
  }

  // Fast Intercept: Customer asking for payment link without selecting a number
  const isAskingPaymentLink = /\b(payment\s*link|pay\s*link|link\s*(?:do|bhejo|dijiye|send|bhej)|kaise\s*pay\s*(?:kare|karein|karu)|pay\s*kaise\s*(?:kare|karein|karu)|checkout\s*link)\b/i.test(userMessage);
  const hasTargetProduct = customerContext.targetProduct && !customerContext.targetProduct.notFound;
  if (isAskingPaymentLink && !hasTargetProduct && !detected10Digit) {
    let noNumReply;
    if (lang === 'English') {
      noNumReply = `To provide a payment link, please first select or choose your preferred VIP mobile number from our collection! 😊\n\nOnce you choose a number, I will immediately share its direct online booking link so you can complete your order securely. Would you like to explore some trending VIP numbers or search by your favourite digits or budget?`;
    } else if (lang === 'Hindi') {
      noNumReply = `पेमेंट लिंक के लिए कृपया पहले अपना पसंदीदा VIP मोबाइल नंबर चुन लीजिए! 😊\n\nजैसे ही आप कोई नंबर चुनेंगे, मैं तुरंत उसका सीधा बुकिंग लिंक आपके साथ शेयर कर दूँगी ताकि आप आसानी से सुरक्षित पेमेंट कर सकें। क्या आप ट्रेंडिंग नंबर्स देखना चाहेंगे या आपका कोई पसंदीदा डिजिट या बजट है?`;
    } else if (lang === 'Gujarati') {
      noNumReply = `પેમેન્ટ લિંક માટે કૃપા કરીને પહેલા તમારો મનપસંદ VIP મોબાઇલ નંબર પસંદ કરી લો! 😊\n\nજેવો તમે કોઈ નંબર પસંદ કરશો, હું તરત જ તેની ડાયરેક્ટ બુકિંગ લિંક મોકલી આપીશ જેથી તમે સુરક્ષિત રીતે ઓર્ડર કરી શકો. શું તમારે ટ્રેન્ડિંગ નંબર્સ જોવા છે કે તમારું કોઈ બજેટ છે?`;
    } else if (lang === 'Marathi') {
      noNumReply = `पेमेंट लिंकसाठी कृपया आधी तुमचा आवडता VIP मोबाईल नंबर निवडा! 😊\n\nतुम्ही नंबर निवडताच, मी लगेच त्याची थेट बुकिंग लिंक पाठवून देईन जेणेकरून तुम्ही सुरक्षित पेमेंट करू शकाल. तुम्हाला काही ट्रेंडिंग नंबर पाहायचे आहेत का किंवा तुमचे काही बजेट आहे?`;
    } else {
      noNumReply = `Payment link ke liye please pehle apna pasandeeda VIP mobile number choose kar lijiye! 😊\n\nJaise hi aap koi number select karenge, main turant uska direct online booking link aapko bhej dungi jisse aap securely order complete kar sakein. Kya aap kuch trending VIP numbers dekhna chahenge ya aapka koi specific budget ya favourite digit hai?`;
    }
    return {
      reply: noNumReply,
      conversationalIntro: noNumReply,
      searchJSON: null,
      model: 'rule-guard',
      escalate: false
    };
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
      fallbackReply = "Sorry, I'm having a brief technical issue. Please try again in a moment or reach our helpline *+91 9222 222 007* (10am–7pm Mon–Sat). \uD83D\uDE4F";
    } else if (lang === 'Hindi') {
      fallbackReply = "माफ़ी चाहती हूँ, अभी थोड़ी तकनीकी समस्या है। कृपया थोड़ी देर बाद पुनः प्रयास करें या हमारे हेल्पलाइन *9222 222 007* (10am–7pm सोम–शनि) पर संपर्क करें। \uD83D\uDE4F";
    } else if (lang === 'Gujarati') {
      fallbackReply = "માફ કરશો, અત્યારે થોડી તકનીકી સમસ્યા છે. કૃપા કરીને થોડીવાર પછી ફરી પ્રયાસ કરો અથવા *9222 222 007* (10am–7pm Mon–Sat) પર કૉલ કરો. \uD83D\uDE4F";
    } else if (lang === 'Marathi') {
      fallbackReply = "क्षमस्व, सध्या थोडी तांत्रिक अडचण आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा किंवा *9222 222 007* (10am–7pm सोम–शनि) वर संपर्क करा. \uD83D\uDE4F";
    } else {
      fallbackReply = "Oops! Abhi thodi technical dikkat hai. Thodi der baad try karein ya *9222 222 007* (10am–7pm Mon–Sat) pe connect karein. \uD83D\uDE4F";
    }
    return { reply: fallbackReply, conversationalIntro: fallbackReply, searchJSON: null, model: 'fallback', escalate: false };
  }

  const agentText = llmResult.text;
  const usedModel = llmResult.model;

  console.log('[Agent] Raw (' + usedModel + '):', agentText.substring(0, 500));

  const searchJSON = extractSearchJSON(agentText);
  let conversationalText = sanitizeHallucinatedNumbers(cleanMarkdownTables(stripSearchJSON(agentText)));
  const conversationalIntro = conversationalText;

  if (searchJSON !== undefined) {
    console.log('[Agent] Searching with:', JSON.stringify(searchJSON));
    try {
      let result = await fetchNumbers(searchJSON, page);
      let fallbackNote = '';
      let effectiveSearchJSON = searchJSON;

      // Smart multi-step search relaxation if 0 results
      if ((!result.products || result.products.length === 0) && page === 1) {
        console.log('[Agent] Initial search yielded 0 results. Running smart relaxation...');

        // 1. Both category AND maxPrice present: relax narrow category to find numbers in requested budget!
        if (searchJSON.category && searchJSON.maxPrice) {
          const relaxedA = { ...searchJSON };
          delete relaxedA.category;
          const resA = await fetchNumbers(relaxedA, 1);
          if (resA.products && resA.products.length > 0) {
            result = resA;
            effectiveSearchJSON = relaxedA;
            const catName = formatCategoryName(searchJSON.category);
            const budgetFormatted = Number(searchJSON.maxPrice).toLocaleString('en-IN');
            if (lang === 'English') {
              fallbackNote = `\n\n📌 *Note:* Pure ${catName} start in higher luxury price tiers. However, here are outstanding VIP numbers available within your *₹${budgetFormatted}* budget:`;
            } else if (lang === 'Hindi') {
              fallbackNote = `\n\n📌 *नोट:* ${catName} लक्ज़री सेगमेंट में आते हैं। लेकिन आपके *₹${budgetFormatted}* के बजट में ये शानदार VIP नंबर उपलब्ध हैं:`;
            } else {
              fallbackNote = `\n\n📌 *Note:* Pure ${catName} luxury segment mein aate hain. Lekin aapke *₹${budgetFormatted}* ke budget mein ye shandar VIP numbers available hain:`;
            }
          } else {
            // Try doubling numbers within budget
            const relaxedB = { category: 'doubling-numbers', maxPrice: searchJSON.maxPrice };
            const resB = await fetchNumbers(relaxedB, 1);
            if (resB.products && resB.products.length > 0) {
              result = resB;
              effectiveSearchJSON = relaxedB;
              const budgetFormatted = Number(searchJSON.maxPrice).toLocaleString('en-IN');
              if (lang === 'English') {
                fallbackNote = `\n\n📌 *Note:* Here are premium Doubling VIP numbers available within your *₹${budgetFormatted}* budget:`;
              } else {
                fallbackNote = `\n\n📌 *Note:* Aapke *₹${budgetFormatted}* budget ke andar ye shandar Doubling VIP numbers available hain:`;
              }
            }
          }
        }

        // 2. Category + restrictive sub-filters (scoreSum, anywhere, endsWith) had 0 results
        else if (searchJSON.category && (searchJSON.scoreSum || searchJSON.anywhere || searchJSON.endsWith || searchJSON.digitFreq1Digit)) {
          const relaxedC = { category: searchJSON.category };
          const resC = await fetchNumbers(relaxedC, 1);
          if (resC.products && resC.products.length > 0) {
            result = resC;
            effectiveSearchJSON = relaxedC;
            const catName = formatCategoryName(searchJSON.category);
            if (lang === 'English') {
              fallbackNote = `\n\n📌 *Note:* That exact sub-pattern combination in ${catName} is currently unavailable, but here are the top available ${catName}:`;
            } else {
              fallbackNote = `\n\n📌 *Note:* Is exact combination mein abhi number available nahi hai, par is category ke top VIP numbers ye rahe:`;
            }
          }
        }

        // 3. Digit pattern + scoreSum had 0 results: search digits directly without scoreSum
        else if (searchJSON.scoreSum && (searchJSON.anywhere || searchJSON.endsWith || searchJSON.startsWith)) {
          const relaxedD = { anywhere: searchJSON.anywhere, endsWith: searchJSON.endsWith, startsWith: searchJSON.startsWith };
          const resD = await fetchNumbers(relaxedD, 1);
          if (resD.products && resD.products.length > 0) {
            result = resD;
            effectiveSearchJSON = relaxedD;
            if (lang === 'English') {
              fallbackNote = `\n\n📌 *Note:* Here are top numbers featuring your requested digits:`;
            } else {
              fallbackNote = `\n\n📌 *Note:* Aapke pasandeeda digits ke saath ye top VIP numbers available hain:`;
            }
          }
        }
      }

      const productsBlock = formatProducts(
        result.products, result.totalCount, result.currentPage, result.totalPages, lang
      );

      if (productsBlock) {
        if (fallbackNote) {
          conversationalText = conversationalText
            ? (conversationalText + fallbackNote + '\n\n' + productsBlock)
            : (fallbackNote.trim() + '\n\n' + productsBlock);
        } else {
          conversationalText = conversationalText
            ? (conversationalText + '\n\n' + productsBlock)
            : productsBlock;
        }
        return {
          reply: conversationalText,
          conversationalIntro: conversationalIntro,
          searchJSON: effectiveSearchJSON,
          model: usedModel,
          escalate: false,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          currentPage: result.currentPage,
        };
      } else {
        // Engaging consultative follow-up — NEVER an abrupt dead-end!
        let engagingFollowUp;
        if (lang === 'English') {
          engagingFollowUp = `\n\nThe exact combination you're looking for isn't in our active inventory right now.\n\n` +
            `Don't worry at all! We have over 1 Lakh+ VIP mobile numbers in our collection. Tell me:\n` +
            `🔹 Do you have any favourite digits (like 9, 7, 5, or 0)?\n` +
            `🔹 Would you like to see popular styles like Doubling, 786 series, or your Lucky Sum?\n\n` +
            `Tell me your preference and I'll find the best options for you right away! 😊`;
        } else if (lang === 'Hindi') {
          engagingFollowUp = `\n\nआपके द्वारा मांगा गया सटीक कॉम्बिनेशन अभी हमारे एक्टिव स्टॉक में उपलब्ध नहीं है।\n\n` +
            `लेकिन चिंता की कोई बात नहीं! हमारे पास 1 लाख से अधिक VIP नंबर्स का विशाल संग्रह है। आप मुझे बताइए:\n` +
            `🔹 आपका कोई पसंदीदा अंक है (जैसे 9, 7, 5 या 0)?\n` +
            `🔹 या आप डबलिंग, 786 सीरीज़ या अपने लकी सम में नंबर देखना चाहेंगे?\n\n` +
            `आप बताइए, मैं तुरंत आपके लिए बेहतरीन विकल्प निकाल कर दिखाती हूँ! 😊`;
        } else if (lang === 'Gujarati') {
          engagingFollowUp = `\n\nતમે જે ચોક્કસ કોમ્બિનેશન માંગ્યું છે તે અત્યારે અમારા સ્ટોકમાં ઉપલબ્ધ નથી.\n\n` +
            `પણ ચિંતા ના કરશો! અમારી પાસે 1 લાખથી વધુ VIP નંબર્સ છે. તમે મને કહો:\n` +
            `🔹 તમારો કોઈ ફેવરિટ નંબર છે (જેમ કે 9, 7, 5, 0)?\n` +
            `🔹 કે પછી ડબલિંગ, 786 સીરીઝ અથવા લકી સમમાં નંબર જોવા છે?\n\n` +
            `તમે જણાવો, હું તરત જ તમારા માટે બેસ્ટ ઓપ્શન્સ શોધી આપું છું! 😊`;
        } else if (lang === 'Marathi') {
          engagingFollowUp = `\n\nतुम्ही मागितलेले कॉम्बिनेशन सध्या आमच्या उपलब्ध साठ्यात उपलब्ध नाही.\n\n` +
            `पण काळजी करू नका! आमच्याकडे 1 लाखांहून अधिक VIP नंबर्स आहेत. मला सांगा:\n` +
            `🔹 तुमचा कोणताही आवडता अंक आहे का (उदा. 9, 7, 5, किंवा 0)?\n` +
            `🔹 की तुम्हाला डबलિંગ, 786 सीरिज किंवा तुमच्या लकी सममधील नंबर पाहायचे आहेत?\n\n` +
            `तुम्ही सांगा, मी लगेच तुमच्यासाठी सर्वोत्तम पर्याय शोधून देते! 😊`;
        } else {
          engagingFollowUp = `\n\nAapne jo exact combination manga hai, woh is waqt hamare active collection mein available nahi hai.\n\n` +
            `Lekin fikar bilkul mat kijiye! Hamare paas 1 Lakh+ VIP numbers hain. Aap mujhe batayein:\n` +
            `🔹 Aapka koi favourite digit hai (jaise 9, 7, 5, 0)?\n` +
            `🔹 Ya kisi specific category jaise Doubling, 786 series, ya apne Lucky Sum mein number dekhna chahenge?\n\n` +
            `Aap jo bataenge, main turant best options nikal ke dikhati hoon! 😊`;
        }
        conversationalText = conversationalText ? (conversationalText + engagingFollowUp) : engagingFollowUp.trim();
        return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: null, model: usedModel, escalate: false };
      }
    } catch (searchErr) {
      console.error('[Agent] Search failed:', searchErr.message);
    }
  }

  return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: null, model: usedModel, escalate: false };
}
