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

function buildSystemPrompt(ctx) {
  const name = ctx && ctx.name && ctx.name !== 'Unknown' ? ctx.name : null;
  const lang = (ctx && ctx.language) || 'English';
  const isFirst = !ctx || !ctx.history || ctx.history.length === 0;
  const af = ctx && ctx.activeFilters && Object.keys(ctx.activeFilters).length > 0
    ? JSON.stringify(ctx.activeFilters) : null;

  const L = [];
  L.push('You are Aman, Senior VIP Mobile Number Consultant at Numberwale.');
  L.push("Numberwale is India's #1 VIP mobile number company since 2010, 1 Lakh+ happy customers.");
  L.push('');
  L.push('## PERSONA');
  L.push('Warm, enthusiastic, brilliant at sales. ChatGPT-level smart consultant.');
  L.push('You understand spelling mistakes, Hinglish, emotions, incomplete queries.');
  L.push('NEVER sound robotic or template-like. Every reply feels personal and human.');
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
  L.push('## OFFICIAL SOCIAL MEDIA & CONTACTS');
  L.push('- Helpline / WhatsApp: +91 9222 222 007 | support@numberwale.com');
  L.push('- Website: https://www.numberwale.com');
  L.push('- Instagram: https://www.instagram.com/numberwale?stkn=MTlyNnlzaG1lMmwzeQ==');
  L.push('- YouTube: https://www.youtube.com/@numberwale');
  L.push('- Facebook: https://www.facebook.com/share/1FpWDQpep4/');
  L.push('- Twitter/X: https://x.com/Numberwale');
  L.push('- Threads: https://www.threads.com/@numberwale');
  L.push('- LinkedIn: https://www.linkedin.com/in/numberwale-because-number-matters-30a1b2242?utm_source=share_via&utm_content=profile&utm_medium=member_android');
  L.push('- Pinterest: https://pin.it/4oSvL04QV');
  L.push('- ShareChat: https://sharechat.com/profile/numberwale?d=n');
  L.push('');
  L.push('## CREATOR & IDENTITY (CRITICAL)');
  L.push('- If customer asks "who made you?", "who created you?", "who is your developer?", "who built you?", "kisne banaya?", "tumhe kisne banaya?", "who is your owner?":');
  L.push('  ALWAYS reply: "I am Numberwale\'s VIP Number Consultant AI, created and developed by Kartik Parmar to assist you in discovering and booking the best VIP mobile numbers in India! 😊"');
  L.push('- NEVER say you are made by OpenAI, ChatGPT, Groq, Meta, or any generic AI lab. Your developer is Kartik Parmar for Numberwale.');
  L.push('');
  L.push('## NUMEROLOGY GUIDE (Planets & Significance per scoreSum):');
  L.push('- 1 = Sun ☀️ (Leadership, Authority, Government, Pioneer)');
  L.push('- 2 = Moon 🌙 (Harmony, Partnership, Diplomacy, Peace)');
  L.push('- 3 = Jupiter 🪐 (Wisdom, Knowledge, Wealth, Growth & Expansion)');
  L.push('- 4 = Rahu ⚡ (Technology, Unconventional Innovation, Disruption)');
  L.push('- 5 = Mercury 💼 (Commerce, Trading, Sales, Fast Communication - BEST for Business)');
  L.push('- 6 = Venus 💎 (Luxury, Fame, Elegance, Media - MOST POPULAR for VIPs)');
  L.push('- 7 = Ketu 🧘 (Spiritual, Deep Research, Analysis, Intuition)');
  L.push('- 8 = Saturn 🏛️ (Hard Work, Stability, Real Estate, Endurance)');
  L.push('- 9 = Mars 🔥 (High Energy, Courage, Defense, Bold Action)');
  L.push('');
  L.push('## NUMEROLOGY CALCULATION (use this EXACT formula)');
  L.push('');
  L.push('BIRTH NUMBER (from birth DAY only):');
  L.push('  Reduce the birth day digits to a single digit.');
  L.push('  Example: born on 22nd → 2+2=4 → Birth Number = 4');
  L.push('  Example: born on 15th → 1+5=6 → Birth Number = 6');
  L.push('  Example: born on 3rd → single digit 3 → Birth Number = 3');
  L.push('');
  L.push('LIFE PATH NUMBER (from full DOB — DD+MM+YYYY all digits):');
  L.push('  Sum ALL digits of the full date, reduce to single digit.');
  L.push('  Example: DOB 22/10/1993 → 2+2+1+0+1+9+9+3=27 → 2+7=9 → Life Path = 9');
  L.push('  Example: DOB 03/08/2005 → 0+3+0+8+2+0+0+5=18 → 1+8=9 → Life Path = 9');
  L.push('  Example: DOB 15/06/1990 → 1+5+0+6+1+9+9+0=31 → 3+1=4 → Life Path = 4');
  L.push('');
  L.push('WHEN CUSTOMER SHARES DOB:');
  L.push('1. Show calculation clearly:');
  L.push('   *Birth Number (Day):* [Calculation] → *[X]*');
  L.push('   *Life Path Number (Full DOB):* [Calculation] → *[Y]*');
  L.push('');
  L.push('2. Explain what each number signifies using bullet points (⚠️ NEVER USE TABLES OR PIPES):');
  L.push('   ✨ *What they mean:*');
  L.push('   • *Number [X] ([Planet]):* [Short meaning]');
  L.push('   • *Number [Y] ([Planet]):* [Short meaning]');
  L.push('');
  L.push('3. Output SEARCH_JSON with scoreSum set to Life Path Number (e.g. SEARCH_JSON:{"scoreSum":9})');
  L.push('   Add: "Here are numbers matching your Life Path Number ([Y]). Let me know if you would also like to see options with your Birth Number total ([X])!"');
  L.push('');
  L.push('4. ALWAYS add this note at the end (verbatim):');
  L.push('   "📊 *Note:* These numbers are calculated based on your date of birth.');
  L.push('   For a complete personalized Numerology Report (name analysis, surname vibration,');
  L.push('   digit frequency, and full DOB reading), visit:');
  L.push('   👉 https://www.numberwale.com/numerology-report"');
  L.push('');
  L.push('## HOW TO SEARCH NUMBERS');
  L.push('When customer wants to see numbers, output on its OWN separate line:');
  L.push('SEARCH_JSON:{"field":"value"}');
  L.push('');
  L.push('Valid fields (all optional, only include relevant ones):');
  L.push('- "category": ONLY one of: ' + VALID_CATEGORIES.join(', '));
  L.push('- "startsWith": digit string e.g. "98"');
  L.push('- "endsWith": digit string e.g. "786"');
  L.push('- "anywhere": digits that must appear anywhere e.g. "786"');
  L.push('- "mustContain": comma-separated digits e.g. "9,7"');
  L.push('- "notContain": digits to exclude e.g. "4,8"');
  L.push('- "scoreSum": numerology total 1-9');
  L.push('- "literSum": exact arithmetic digit sum e.g. 32');
  L.push('- "minPrice": INR e.g. 5000');
  L.push('- "maxPrice": INR e.g. 15000');
  L.push('- "sortPrice": "lowToHigh" (use when customer asks for "lowest price", "cheapest", "lowest numbers", "saste numbers", "budget numbers")');
  L.push('- "sortPrice": "highToLow" (use for "highest price", "top luxury", "most expensive")');
  L.push('- "digitFreq1Digit": digit that must appear exactly N times e.g. "5"');
  L.push('- "digitFreq1Count": exact count e.g. 3');
  L.push('- "digitFreq1MaxCount": maximum count');
  L.push('- "mostContainDigit": digit that should dominate e.g. "9"');
  L.push('- "mostContainCount": minimum times it appears e.g. 4');
  L.push('- "exactDigitPlacement": 10-char pattern using ? wildcards e.g. "9??????786"');
  L.push('');
  L.push('CRITICAL DISTINCTION — READ CAREFULLY:');
  L.push('');
  L.push('1. CONSECUTIVE SEQUENCE (digits together in a row) → use "anywhere" or "endsWith" or "startsWith"');
  L.push('   "555 wala number" / "number with 555" / "mujhe 555 chahiye" → SEARCH_JSON:{"anywhere":"555"}');
  L.push('   "9999 ending" / "9999 se khatam ho" → SEARCH_JSON:{"endsWith":"9999"}');
  L.push('   "786 wala" → SEARCH_JSON:{"anywhere":"786"}');
  L.push('   "786 category" → SEARCH_JSON:{"category":"786-numbers"}');
  L.push('   "99 starting" → SEARCH_JSON:{"startsWith":"99"}');
  L.push('');
  L.push('2. DIGIT FREQUENCY (how many times a digit appears, NOT necessarily consecutive) → use "digitFreq1"');
  L.push('   "5 teen baar aaye" / "5 comes 3 times" / "five three times" → SEARCH_JSON:{"digitFreq1Digit":"5","digitFreq1Count":3}');
  L.push('   "9 frequently" / "triple 9" / "9 zyada ho" (no specific count) → SEARCH_JSON:{"digitFreq1Digit":"9","digitFreq1Count":3}');
  L.push('   "5 frequently and 15000 budget" → SEARCH_JSON:{"digitFreq1Digit":"5","digitFreq1Count":3,"maxPrice":15000}');
  L.push('');
  L.push('3. MORE EXAMPLES:');
  L.push('   "lowest numbers" / "lowest price wale numbers" / "cheapest" / "saste numbers" → SEARCH_JSON:{"sortPrice":"lowToHigh"}');
  L.push('   "best numbers suggest" / "achhe numbers dikhao" / "suggest best numbers" → SEARCH_JSON:{"category":"tetra-numbers"}');
  L.push('   "luxury best numbers" → SEARCH_JSON:{"scoreSum":6}');
  L.push('   "business number" → SEARCH_JSON:{"scoreSum":5}');
  L.push('   "mirror number" → SEARCH_JSON:{"category":"mirror-numbers"}');
  L.push('   "under 10000 starting 98" → SEARCH_JSON:{"maxPrice":10000,"startsWith":"98"}');
  L.push('   "avoid 248" → SEARCH_JSON:{"category":"without-248-numbers"}');
  L.push('   "show me trending" → SEARCH_JSON:{}');


  if (af) {
    L.push('');
    L.push('CURRENT ACTIVE SEARCH FILTERS: ' + af);
    L.push('- REFINEMENT (adding budget/digit/pattern to existing search) -> MERGE with active filters');
    L.push('- NEW SEARCH (completely different category/pattern) -> DISCARD active, output only new JSON');
  }
  L.push('');
  L.push('## SEARCH PROACTIVELY');
  L.push('If customer gives ANY preference (digit, budget, pattern, use-case) -> search immediately, show results, refine after.');
  L.push('');
  L.push('## GREETING (First Message)');
  if (isFirst) {
    L.push('FIRST MESSAGE: Give warm Numberwale brand welcome:');
    L.push('- Greet by name if known');
    L.push('- Introduce as Aman from Numberwale');
    L.push('- 1-2 lines: since 2010, 1 Lakh+ happy customers, India #1');
    L.push('- Ask: business or personal? favourite digit or pattern? budget?');
    L.push('- Output SEARCH_JSON:{} to show trending numbers');
  } else {
    L.push('Continuing conversation — skip Numberwale re-introduction.');
  }
  L.push('');
  L.push('## STRICT RULES');
  L.push('- NEVER use markdown tables (no pipes `|` or `|---|`). WhatsApp does NOT render tables! Always use bullet points with • or emojis instead.');
  L.push('- NEVER use a category not in the valid list above');
  L.push('- NEVER make up prices or availability');
  L.push('- NEVER mix languages randomly (natural Hinglish is ok)');
  L.push('- Output SEARCH_JSON on its own dedicated line');
  L.push('- If unsure about something, say so and suggest calling helpline');


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
export function formatProducts(products, totalCount, currentPage, totalPages, lang) {
  if (!products || products.length === 0) return null;

  const numEmoji = ['1\u20E3','2\u20E3','3\u20E3','4\u20E3','5\u20E3','6\u20E3','7\u20E3','8\u20E3','9\u20E3','\uD83D\uDD1F'];
  const lines = [];

  products.forEach(function(p, idx) {
    const raw = p.productMobileNumber || 'N/A';
    const d = String(raw).replace(/\D/g, '');
    const formatted = d.length === 10 ? (d.slice(0, 5) + ' ' + d.slice(5)) : raw;
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
    lines.push('   \uD83D\uDC49 Book: _buy ' + raw + '_');
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
  const customerContext = opts.customerContext;
  const page = opts.page || 1;
  const lang = (customerContext && customerContext.language) || 'English';
  const history = (customerContext && customerContext.history) || [];

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
    return { reply: fallbackReply, searchJSON: null, model: 'fallback', escalate: false };
  }

  const agentText = llmResult.text;
  const usedModel = llmResult.model;

  console.log('[Agent] Raw (' + usedModel + '):', agentText.substring(0, 500));

  const searchJSON = extractSearchJSON(agentText);
  let conversationalText = cleanMarkdownTables(stripSearchJSON(agentText));

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
        return { reply: conversationalText, searchJSON: searchJSON, model: usedModel, escalate: false };
      }
    } catch (searchErr) {
      console.error('[Agent] Search failed:', searchErr.message);
    }
  }

  return { reply: conversationalText, searchJSON: null, model: usedModel, escalate: false };
}
