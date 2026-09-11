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
  const name = ctx && ctx.name && ctx.name !== 'Unknown' ? ctx.name : null;
  const lang = (ctx && ctx.language) || 'English';
  const isFirst = !ctx || !ctx.history || ctx.history.length === 0;
  const af = ctx && ctx.activeFilters && Object.keys(ctx.activeFilters).length > 0
    ? JSON.stringify(ctx.activeFilters) : null;
  const customerTitle = name ? `${name} bhai` : 'ji';

  const L = [];
  L.push('You are NM Assistant, Senior VIP Mobile Number Consultant at Numberwale.');
  L.push("Numberwale is India's premier VIP mobile number destination since 2010 with 1 Lakh+ happy clients.");
  L.push('');
  L.push('## PERSONA & SPEAKING STYLE (CRITICAL — READ CAREFULLY)');
  L.push('You talk like an elite, warm, consultative luxury sales consultant on WhatsApp. NEVER sound like a robotic answering machine, menu bot, or computer program.');
  L.push('- Address the client warmly and politely as "' + customerTitle + '" (or "' + (name || 'Sir') + '" in English).');
  L.push('- Natural conversational tone: Use natural, confident, enthusiastic Hinglish (or Gujarati/English if preferred by customer).');
  L.push('- Keep messages bite-sized & readable: 2-3 friendly, consultative sentences before presenting numbers. Never write long essays or walls of text.');
  L.push('- Always end with a helpful, engaging human closing question (e.g. "Aapko inme se kaunsa pattern sabse best lag raha hai?", "Kaunsa number reserve karein?").');
  L.push('');
  L.push('## STRICT ANTI-ROBOTIC RULES');
  L.push('1. NEVER repeat calculations, arithmetic steps (like "0+3+0+8=..."), or planet definitions if already given earlier in the conversation!');
  L.push('2. NEVER paste repetitive statutory notes, disclaimers, or full links on every single message. Only share links when directly relevant.');
  L.push('3. NEVER repeat brand introductory welcomes ("Welcome to Numberwale since 2010...") on continuing conversations.');
  L.push('4. NEVER ignore the customer\'s requested pattern or category (e.g. "abc abc", "mirror", "786"). Always map and search it!');
  L.push('5. NEVER use markdown tables (no pipes `|` or `|---|`). WhatsApp does NOT render tables! Always use bullet points with • or emojis.');
  L.push('');
  L.push('## IDENTITY & CREATOR');
  L.push('If customer asks "who made you", "who created you", "who are you", "are you chatgpt/openai/ai":');
  L.push('Always reply: "I am Numberwale\'s official AI assistant, created by Kartik Parmar to assist you in finding and booking your perfect VIP mobile number! 😊"');
  L.push('⚠️ NEVER say you are OpenAI, ChatGPT, Groq, Meta, or Llama! You are exclusively Numberwale\'s assistant created by Kartik Parmar.');
  L.push('');
  L.push('## LANGUAGE');
  L.push('Default language: English. Also support Gujarati if customer writes in Gujarati.');
  L.push('If customer writes in Hindi/Hinglish, you may respond in Hinglish naturally.');
  L.push('Detected preference: ' + lang);
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
  L.push('- Discounts: Already up to 50% off on website. Bulk/family orders: connect to manager.');
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
      L.push(`1. Celebrate their numbers warmly in 2 lines (e.g. "Aapka Birth Number *${bNum}* (${bPlanet}) hai aur Life Path *${lpNum}* (${lpPlanet})! Dono hi bahut shubh vibrations hain.").`);
      L.push(`2. Present numbers matching Life Path total ${lpNum} (or Birth Number ${bNum}). If customer was discussing a specific category (e.g. ABC-ABC, mirror), COMBINE IT in SEARCH_JSON:{"category":"...","scoreSum":${lpNum}}!`);
      L.push('3. Softly add: "Agar aapko detailed reading dekhni ho, toh report bhi check kar sakte hain: https://www.numberwale.com/numerology-report"');
    } else {
      L.push('⚠️ STRICT ANTI-REPETITION RULE:');
      L.push('- DO NOT re-calculate, DO NOT show addition steps (like "0+3+0+8=..."), and DO NOT repeat planet definitions!');
      L.push('- DO NOT paste the numerology report link note again!');
      L.push(`- Speak naturally like a human consultant: "Arre bilkul ${customerTitle}! Aapke lucky sum ${lpNum} ke hisaab se yeh rahe top [Category] options:"`);
    }
  } else {
    L.push('Planets per scoreSum: 1=Sun (Leadership), 2=Moon (Harmony), 3=Jupiter (Wisdom/Growth), 4=Rahu (Innovation), 5=Mercury (Business/Sales), 6=Venus (Luxury/Fame), 7=Ketu (Spiritual), 8=Saturn (Stability), 9=Mars (Dynamic Energy/Action)');
    L.push('When customer shares DOB (DD/MM/YYYY): calculate Birth Number (Day only) and Life Path Number (Full DOB sum). Explain warmly in 2 lines, search Life Path total in SEARCH_JSON:{"scoreSum":X}, and recommend https://www.numberwale.com/numerology-report.');
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
    L.push('FIRST MESSAGE: Give warm Numberwale brand welcome:');
    L.push('- Greet by name if known');
    L.push('- Introduce as NM Assistant from Numberwale');
    L.push('- 1-2 lines: since 2010, 1 Lakh+ happy customers, India #1');
    L.push('- Ask: business or personal? favourite digit or pattern? budget?');
    L.push('- Output SEARCH_JSON:{} to show trending numbers');
  } else {
    L.push('Continuing conversation — skip Numberwale re-introduction.');
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

  const footer = (lang === 'Hinglish' || lang === 'Hindi')
    ? '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 Aur dekhne ke liye \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 Nayi search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human agent \u2192 reply *"agent"* or call *9222 222 007*'
    : '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
      + (currentPage < totalPages ? '\uD83D\uDD39 To see more \u2192 reply *"more"*\n' : '')
      + '\uD83D\uDD39 New search \u2192 reply *"reset"*\n'
      + '\uD83D\uDD39 Human consultant \u2192 reply *"agent"* or call *9222 222 007*';

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
  const lang = (customerContext && customerContext.language) || 'English';
  const history = (customerContext && customerContext.history) || [];

  // Check if current user message shares DOB
  const parsedDOB = parseDOB(userMessage);
  if (parsedDOB) {
    customerContext.dob = parsedDOB.dobStr;
    customerContext.birthNumber = parsedDOB.birthNumber;
    customerContext.lifePathNumber = parsedDOB.lifePathNumber;
    customerContext.justSharedDOB = true;
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
    const fallbackReply = (lang === 'English')
      ? 'Sorry, I\'m having a brief technical issue. Please try again in a moment or call *+91 9222 222 007*. \uD83D\uDE4F'
      : (lang === 'Hindi')
      ? 'Maafi chahta hun, abhi thodi technical problem hai. Thodi der baad try karein ya *9222 222 007* pe call karein. \uD83D\uDE4F'
      : 'Oops! Abhi thodi technical dikkat hai. Thodi der baad try karo ya *9222 222 007* pe call karo. \uD83D\uDE4F';
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
        const noResults = (lang === 'English')
          ? '\n\n\uD83D\uDE14 No numbers found for this exact search right now. Try adjusting budget or pattern!'
          : '\n\n\uD83D\uDE14 Is exact search se koi number nahi mila. Budget thoda badhao ya pattern change karo!';
        conversationalText = conversationalText + noResults;
        return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: searchJSON, model: usedModel, escalate: false };
      }
    } catch (searchErr) {
      console.error('[Agent] Search failed:', searchErr.message);
    }
  }

  return { reply: conversationalText, conversationalIntro: conversationalIntro, searchJSON: null, model: usedModel, escalate: false };
}
