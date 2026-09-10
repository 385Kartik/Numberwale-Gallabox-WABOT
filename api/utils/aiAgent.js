'use strict';
/**
 * aiAgent.js - Unified OpenAI-powered Conversational Agent for Numberwale
 * Replaces all fragmented intent handlers with a single ChatGPT-style agent.
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
  L.push('NEVER sound robotic. Every reply feels personal and human.');
  L.push('');
  L.push('## LANGUAGE');
  L.push('Respond in: Hinglish (default), Hindi (if Devanagari), English, Gujarati, or Marathi — based on customer message.');
  L.push('Detected preference: ' + lang);
  L.push(name ? 'Customer name: ' + name : 'Customer name: Unknown');
  L.push('');
  L.push('## NUMBERWALE FACTS (use strictly, never guess)');
  L.push('- Founded 2010 | 1 Lakh+ clients | Helpline: +91 9222 222 007 | support@numberwale.com');
  L.push('- Office: Bhayandar East, Thane/Mumbai, Maharashtra 401105');
  L.push('- Process: Pay online -> UPC + GST invoice in 24h -> e-KYC at any Jio/Airtel/Vi/BSNL store with Aadhar -> Active in 3-5 business days');
  L.push('- Works with: All operators (Jio, Airtel, Vi, BSNL) | 4G/5G | Prepaid or Postpaid | eSIM convertible');
  L.push('- Payment: UPI / Cards / NetBanking / EMI | NO COD (UPC is digital)');
  L.push('- 100% Money-Back Guarantee if porting fails | Fresh UPC free if expired within 4 days');
  L.push('- 18% GST included, official GST invoice provided | Business buyers can claim ITC');
  L.push('- Discounts: Already up to 50% off on site. Bulk orders: call manager.');
  L.push('');
  L.push('## NUMEROLOGY GUIDE');
  L.push('scoreSum 1=Sun(Leadership/Govt), 2=Moon(Harmony/PR), 3=Jupiter(Wisdom/Wealth), 4=Rahu(Tech/Innovation),');
  L.push('5=Mercury(Business/Sales - BEST for commerce), 6=Venus(Luxury/Fame - MOST POPULAR for VIPs),');
  L.push('7=Ketu(Spiritual/Research), 8=Saturn(Stability/Real Estate), 9=Mars(Energy/Courage/Defense)');
  L.push('For birthday-based lucky number: reduce birth day to single digit (Mulank) -> recommend that scoreSum.');
  L.push('Examples: birthday 15 -> 1+5=6 -> scoreSum:6 | birthday 24 -> 2+4=6 -> scoreSum:6 | birthday 8 -> scoreSum:8 | birthday 29 -> 2+9=11->1+1=2 -> scoreSum:2');
  L.push('');
  L.push('## HOW TO SEARCH NUMBERS');
  L.push('When customer wants to see numbers, output this EXACT format on its OWN separate line:');
  L.push('SEARCH_JSON:{"field":"value"}');
  L.push('');
  L.push('Valid search fields (all optional — only include relevant ones):');
  L.push('- "category": ONLY one of: ' + VALID_CATEGORIES.join(', '));
  L.push('- "startsWith": digits e.g. "98"');
  L.push('- "endsWith": digits e.g. "786"');
  L.push('- "anywhere": digits anywhere e.g. "786"');
  L.push('- "mustContain": comma-separated digits e.g. "9,7"');
  L.push('- "notContain": digits to exclude e.g. "4,8"');
  L.push('- "scoreSum": numerology total 1-9');
  L.push('- "literSum": exact arithmetic digit sum e.g. 32');
  L.push('- "minPrice": INR e.g. 5000');
  L.push('- "maxPrice": INR e.g. 15000');
  L.push('- "digitFreq1Digit": digit that must appear N times e.g. "5"');
  L.push('- "digitFreq1Count": exact count e.g. 3');
  L.push('- "digitFreq1MaxCount": maximum count');
  L.push('- "mostContainDigit": digit that should dominate e.g. "9"');
  L.push('- "mostContainCount": minimum times e.g. 4');
  L.push('- "exactDigitPlacement": 10-char string using ? for wildcards e.g. "9??????786"');
  L.push('');
  L.push('NATURAL LANGUAGE -> SEARCH JSON MAPPING:');
  L.push('"9 frequently" / "triple 9" / "9 zyada" / "teen 9" -> SEARCH_JSON:{"digitFreq1Digit":"9","digitFreq1Count":3}');
  L.push('"5 frequently and 15000 budget" -> SEARCH_JSON:{"digitFreq1Digit":"5","digitFreq1Count":3,"maxPrice":15000}');
  L.push('"business number lucky" -> SEARCH_JSON:{"scoreSum":5}');
  L.push('"luxury / premium / VIP feel" -> SEARCH_JSON:{"scoreSum":6}');
  L.push('"mirror number" -> SEARCH_JSON:{"category":"mirror-numbers"}');
  L.push('"9999 ending" -> SEARCH_JSON:{"endsWith":"9999"}');
  L.push('"786 wala chahiye" -> SEARCH_JSON:{"category":"786-numbers"}');
  L.push('"under 10000 starting 98" -> SEARCH_JSON:{"maxPrice":10000,"startsWith":"98"}');
  L.push('"birthday 15 lucky" -> mulank 6 -> SEARCH_JSON:{"scoreSum":6}');
  L.push('"avoid 248" / "without 248" -> SEARCH_JSON:{"category":"without-248-numbers"}');
  L.push('"counting / sequential" -> SEARCH_JSON:{"category":"counting-numbers"}');
  L.push('"4 zeros together" -> SEARCH_JSON:{"anywhere":"0000"}');
  L.push('"kuch trending dikhao" / "show me numbers" -> SEARCH_JSON:{}');
  if (af) {
    L.push('');
    L.push('ACTIVE SEARCH FILTERS (customer already has a search going): ' + af);
    L.push('- REFINEMENT (customer adds budget / digit / pattern to existing search) -> MERGE new constraint WITH active filters');
    L.push('- NEW SEARCH (completely different pattern or category) -> DISCARD active filters, output only new JSON');
  }
  L.push('');
  L.push('## SEARCH PROACTIVELY');
  L.push('DO NOT ask too many questions before searching. If customer gives ANY preference (digit, budget, pattern, use-case) -> search immediately and show results. Refine together after.');
  L.push('');
  L.push('## GREETING');
  if (isFirst) {
    L.push('This is the FIRST message. Give a warm Numberwale brand welcome:');
    L.push('- Greet by name if known, introduce yourself as Aman from Numberwale');
    L.push('- Mention: since 2010, 1 Lakh+ happy customers, India #1');
    L.push('- Ask: business or personal? favourite digit or pattern? budget?');
    L.push('- Also output SEARCH_JSON:{} to show trending numbers below your greeting');
  } else {
    L.push('Continuing conversation — skip Numberwale re-introduction.');
  }
  L.push('');
  L.push('## HUMAN AGENT ESCALATION');
  L.push('If customer says "agent" / "manager" / "talk to human" / "real person" / "baat karni hai" / "call karo" etc. -> respond:');
  L.push('"Please call or WhatsApp our helpline: *+91 9222 222 007* (Mon-Sat 10am-8pm). Our senior manager will assist you personally! \uD83D\uDE0A"');
  L.push('Do NOT output SEARCH_JSON in escalation responses.');
  L.push('');
  L.push('## FORMATTING');
  L.push('- Use WhatsApp formatting: *bold* for key terms, _italic_ for examples');
  L.push('- Emojis naturally (not excessively)');
  L.push('- Warm, concise, human — no walls of text');
  L.push('- Always end with a question or CTA to keep conversation flowing');
  L.push('');
  L.push('## STRICT RULES');
  L.push('- NEVER use a category not in the valid list above (check carefully)');
  L.push('- NEVER make up prices or claim availability without a real search');
  L.push('- NEVER mix languages mid-sentence (except natural Hinglish mixing)');
  L.push('- Output SEARCH_JSON on its own dedicated line, not embedded in text');
  L.push('- If you do not know something, say so and suggest calling helpline');

  return L.join('\n');
}

async function callOpenAI(systemPrompt, messages, model) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured in environment');

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
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

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
    return raw; // may be empty object {} = trending search
  } catch (e) {
    console.error('[Agent] Failed to parse SEARCH_JSON:', match[1], e.message);
    return undefined;
  }
}

function stripSearchJSON(text) {
  return text.replace(/SEARCH_JSON:\{[^]*?\}\s*\n?/g, '').trim();
}

export async function runAgent(opts) {
  const userMessage = opts.userMessage;
  const customerContext = opts.customerContext;
  const page = opts.page || 1;
  const lang = (customerContext && customerContext.language) || 'Hinglish';
  const history = (customerContext && customerContext.history) || [];

  const messages = history.slice(-8).map(function(h) {
    return { role: h.role === 'bot' ? 'assistant' : 'user', content: h.text };
  });
  messages.push({ role: 'user', content: userMessage });

  const systemPrompt = buildSystemPrompt(customerContext);

  let agentText = '';
  let usedModel = 'gpt-4o-mini';

  try {
    agentText = await callOpenAI(systemPrompt, messages, 'gpt-4o-mini');
    usedModel = 'gpt-4o-mini';
  } catch (err) {
    if (err.status === 429 || err.status === 503) {
      console.warn('[Agent] gpt-4o-mini rate limited, trying gpt-3.5-turbo...');
      try {
        agentText = await callOpenAI(systemPrompt, messages, 'gpt-3.5-turbo');
        usedModel = 'gpt-3.5-turbo';
      } catch (err2) {
        throw err2;
      }
    } else {
      throw err;
    }
  }

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
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          currentPage: result.currentPage,
        };
      } else {
        const noResults = (lang === 'English')
          ? '\n\n\uD83D\uDE14 No numbers found for this search right now. Try adjusting budget or pattern!'
          : '\n\n\uD83D\uDE14 Is search se koi number nahi mila. Budget ya pattern thoda change karo!';
        conversationalText = conversationalText + noResults;
        return { reply: conversationalText, searchJSON: searchJSON, model: usedModel };
      }
    } catch (searchErr) {
      console.error('[Agent] Search failed:', searchErr.message);
    }
  }

  return { reply: conversationalText, searchJSON: null, model: usedModel };
}
