'use strict';
/**
 * aiAgent.js - Unified Conversational Agent for Numberwale (Groq + OpenAI load-balanced)
 *
 * Tier 1: Groq (free, ~500ms) — llama-3.3-70b, llama-3.1-8b, gemma2-9b
 * Tier 2: OpenAI (paid fallback) — gpt-4o-mini, gpt-3.5-turbo
 *
 * Returns: { reply, searchJSON, model, escalate, totalCount, totalPages, currentPage }
 * When escalate=true: webhook pauses bot + tags contact in Gallabox
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
  const lang = (ctx && ctx.language) || 'Hinglish';
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
  L.push('Respond in: Hinglish (default), Hindi (Devanagari script), English, Gujarati, or Marathi — based on customer message.');
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
  L.push('## NUMEROLOGY GUIDE');
  L.push('scoreSum 1=Sun(Leadership/Govt), 2=Moon(Harmony/PR), 3=Jupiter(Wisdom/Wealth), 4=Rahu(Tech/Innovation),');
  L.push('5=Mercury(Business/Sales/Trading - MOST AUSPICIOUS for commerce), 6=Venus(Luxury/Fame/VIPs - MOST POPULAR),');
  L.push('7=Ketu(Spiritual/Research), 8=Saturn(Stability/Real Estate), 9=Mars(Energy/Courage/Defense)');
  L.push('For birthday lucky number: reduce birth day to single digit (Mulank) -> recommend that scoreSum.');
  L.push('Examples: day 15 -> 1+5=6 | day 24 -> 2+4=6 | day 29 -> 2+9=11 -> 1+1=2 | day 8 -> 8');
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
  L.push('- "digitFreq1Digit": digit that must appear exactly N times e.g. "5"');
  L.push('- "digitFreq1Count": exact count e.g. 3');
  L.push('- "digitFreq1MaxCount": maximum count');
  L.push('- "mostContainDigit": digit that should dominate e.g. "9"');
  L.push('- "mostContainCount": minimum times it appears e.g. 4');
  L.push('- "exactDigitPlacement": 10-char pattern using ? wildcards e.g. "9??????786"');
  L.push('');
  L.push('EXAMPLES:');
  L.push('"9 frequently" / "triple 9" / "9 zyada" -> SEARCH_JSON:{"digitFreq1Digit":"9","digitFreq1Count":3}');
  L.push('"5 frequently and 15000 budget" -> SEARCH_JSON:{"digitFreq1Digit":"5","digitFreq1Count":3,"maxPrice":15000}');
  L.push('"business number" -> SEARCH_JSON:{"scoreSum":5}');
  L.push('"luxury VIP premium" -> SEARCH_JSON:{"scoreSum":6}');
  L.push('"mirror number" -> SEARCH_JSON:{"category":"mirror-numbers"}');
  L.push('"9999 ending" -> SEARCH_JSON:{"endsWith":"9999"}');
  L.push('"786 wala chahiye" -> SEARCH_JSON:{"category":"786-numbers"}');
  L.push('"under 10000 starting 98" -> SEARCH_JSON:{"maxPrice":10000,"startsWith":"98"}');
  L.push('"birthday 15 lucky" -> mulank 6 -> SEARCH_JSON:{"scoreSum":6}');
  L.push('"avoid 248" -> SEARCH_JSON:{"category":"without-248-numbers"}');
  L.push('"kuch trending dikhao" -> SEARCH_JSON:{}');
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
  L.push('- NEVER use a category not in the valid list above');
  L.push('- NEVER make up prices or availability');
  L.push('- NEVER mix languages randomly (natural Hinglish is ok)');
  L.push('- Output SEARCH_JSON on its own dedicated line');
  L.push('- If unsure about something, say so and suggest calling helpline');

  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// TIER 1: GROQ (free, fast)
// ─────────────────────────────────────────────────────────────────
// Current Groq models (updated Sep 2026 — check console.groq.com/docs/models for latest)
// Primary picks: fast text-chat models on GroqCloud free tier
const GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct', // Llama 4 Scout — fast, good quality
  'meta-llama/llama-4-maverick-17b-128e-instruct', // Llama 4 Maverick — better quality
  'compound-beta-mini',                          // Groq Compound Beta Mini — lightweight
];

async function callGroq(systemPrompt, messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('NO_GROQ_KEY');

  // Round-robin across Groq models to distribute load
  const model = GROQ_MODELS[Math.floor(Math.random() * GROQ_MODELS.length)];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

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
  } finally {
    clearTimeout(timer);
  }
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
  // Try Groq first (free, fast)
  try {
    const result = await callGroq(systemPrompt, messages);
    console.log('[Agent] Groq success:', result.model);
    return result;
  } catch (groqErr) {
    if (groqErr.message === 'NO_GROQ_KEY') {
      console.log('[Agent] No Groq key, using OpenAI...');
    } else if (groqErr.status === 429) {
      console.warn('[Agent] Groq rate limited, falling back to OpenAI...');
    } else {
      console.warn('[Agent] Groq failed (' + groqErr.message + '), falling back to OpenAI...');
    }
  }

  // Fallback to OpenAI
  try {
    const result = await callOpenAI(systemPrompt, messages, 'gpt-4o-mini');
    console.log('[Agent] OpenAI gpt-4o-mini success');
    return result;
  } catch (oaiErr) {
    if (oaiErr.status === 429) {
      console.warn('[Agent] gpt-4o-mini rate limited, trying gpt-3.5-turbo...');
      const result = await callOpenAI(systemPrompt, messages, 'gpt-3.5-turbo');
      console.log('[Agent] OpenAI gpt-3.5-turbo success');
      return result;
    }
    throw oaiErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// FORMAT PRODUCTS
// ─────────────────────────────────────────────────────────────────
function formatProducts(products, totalCount, currentPage, totalPages, lang) {
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

  const pageInfo = currentPage + '/' + totalPages;
  let header;
  if (lang === 'Hindi') {
    header = '\uD83C\uDF1F *' + totalCount + ' \u0928\u0902\u092C\u0930 \u092E\u093F\u0932\u0947* (\u092A\u0947\u091C ' + pageInfo + '):\n\n';
  } else if (lang === 'English') {
    header = '\uD83C\uDF1F *' + totalCount + ' numbers found* (Page ' + pageInfo + '):\n\n';
  } else {
    header = '\uD83C\uDF1F *' + totalCount + ' numbers mile* (Page ' + pageInfo + '):\n\n';
  }

  const footer = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
    + (currentPage < totalPages ? '\uD83D\uDD39 Aur dekhne ke liye \u2192 reply *"more"*\n' : '')
    + '\uD83D\uDD39 Nayi search \u2192 reply *"reset"*\n'
    + '\uD83D\uDD39 Human agent \u2192 reply *"agent"* or call *9222 222 007*';

  return header + lines.join('\n') + footer;
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
  const lang = (customerContext && customerContext.language) || 'Hinglish';
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
  let conversationalText = stripSearchJSON(agentText);

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
