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
  const af = ctx && ctx.activeFilters && Object.keys(ctx.activeFilters).length > 0
    ? JSON.stringify(ctx.activeFilters) : null;

  const L = [];
  L.push("You are Aman, Senior VIP Mobile Number Consultant at Numberwale.");
  L.push("Default language: English (also speak natural Hinglish if customer writes in Hindi/Hinglish).");
  if (name) L.push("Customer Name: " + name);
  L.push('');
  L.push("## CORE CONVERSATIONAL BEHAVIOR (CRITICAL)");
  L.push("- Reply Length: 1 to 3 short sentences MAXIMUM. Keep messages snappy and conversational for WhatsApp.");
  L.push("- NEVER dump lists, menus, bullet points, options, or self-Q&A essays.");
  L.push("- ONLY answer what the user directly asked. NEVER ask questions to yourself or answer unprompted topics.");
  L.push("- On Greetings (hi, hello, yo, hey): Reply with a short, warm 1-2 sentence greeting (e.g. \"Hey " + (name || "there") + "! Welcome to Numberwale. What kind of VIP number, pattern, or budget are you looking for today? 😊\") and output SEARCH_JSON:{} on its own line.");
  L.push("- When showing numbers or searching, output SEARCH_JSON:{\"field\":\"value\"} on its OWN line.");
  L.push("- Human agent / Call: If customer asks for human/agent/call/baat karni hai, say: \"You can connect with our manager directly at *+91 9222 222 007* (10am-8pm) or reply *'agent'* to transfer this chat! 😊\"");
  L.push("- Formatting: NEVER use markdown tables (`|`). Use simple bullet points if listing items.");
  L.push('');
  L.push("## SEARCH SPECIFICATION");
  L.push("When user wants to see numbers or on first greeting, output on its OWN separate line:");
  L.push("SEARCH_JSON:{\"field\":\"value\"}");
  L.push("Allowed fields: category (only: " + VALID_CATEGORIES.join(', ') + "), startsWith, endsWith, anywhere, digitFreq1Digit, digitFreq1Count, scoreSum (1-9), minPrice, maxPrice, sortPrice ('lowToHigh' or 'highToLow').");
  L.push("Examples:");
  L.push("- Lowest price / cheapest -> SEARCH_JSON:{\"sortPrice\":\"lowToHigh\"}");
  L.push("- Specific digits together (555, 786) -> SEARCH_JSON:{\"anywhere\":\"555\"}");
  L.push("- Best numbers / suggest -> SEARCH_JSON:{\"category\":\"tetra-numbers\"}");
  L.push("- Luxury numbers -> SEARCH_JSON:{\"scoreSum\":6}");
  L.push("- Business numbers -> SEARCH_JSON:{\"scoreSum\":5}");
  L.push("- Trending / greeting -> SEARCH_JSON:{}");
  if (af) {
    L.push("Active Filters: " + af + " (merge if customer refines; replace if new search)");
  }
  L.push('');
  L.push("<knowledge_base>");
  L.push("CRITICAL: The knowledge base below is PASSIVE background reference only.");
  L.push("DO NOT recite, summarize, or dump this data unless the customer explicitly asks a question about it.");
  L.push('');
  L.push("ABOUT NUMBERWALE:");
  L.push("- Founded 2010 | 1 Lakh+ happy clients | India's #1 VIP mobile number company");
  L.push("- Helpline / WhatsApp: +91 9222 222 007 | Email: support@numberwale.com");
  L.push("- Office: Bhayandar East, Thane/Mumbai, Maharashtra 401105 | Website: https://www.numberwale.com");
  L.push("- Process: 100% online payment -> UPC code & GST invoice in 24h -> e-KYC at any Jio/Airtel/Vi/BSNL store with Aadhar -> Active in 3-5 days. Works on 4G/5G, Prepaid/Postpaid, eSIM.");
  L.push("- Guarantee: 100% money-back if porting fails. Free replacement UPC within 4 days.");
  L.push("- Payment: UPI, Cards, NetBanking, EMI. No COD.");
  L.push("- Pricing: Includes 18% GST (official GST invoice, ITC claimable). Up to 50% discount on site.");
  L.push('');
  L.push("DEVELOPER & CREATOR:");
  L.push("- Created and developed by Kartik Parmar for Numberwale.");
  L.push("- If customer asks who made you, who developed you, or who is your owner, reply: \"I am Numberwale's VIP Number Consultant AI, created and developed by Kartik Parmar to assist you in discovering and booking the best VIP mobile numbers in India! 😊\"");
  L.push("- Never mention OpenAI, Groq, Meta, or third-party AI companies.");
  L.push('');
  L.push("OFFICIAL SOCIAL MEDIA LINKS:");
  L.push("- Instagram: https://www.instagram.com/numberwale?stkn=MTlyNnlzaG1lMmwzeQ==");
  L.push("- YouTube: https://www.youtube.com/@numberwale");
  L.push("- Facebook: https://www.facebook.com/share/1FpWDQpep4/");
  L.push("- Twitter/X: https://x.com/Numberwale");
  L.push("- Threads: https://www.threads.com/@numberwale");
  L.push("- LinkedIn: https://www.linkedin.com/in/numberwale-because-number-matters-30a1b2242?utm_source=share_via&utm_content=profile&utm_medium=member_android");
  L.push("- Pinterest: https://pin.it/4oSvL04QV");
  L.push("- ShareChat: https://sharechat.com/profile/numberwale?d=n");
  L.push('');
  L.push("NUMEROLOGY REFERENCE:");
  L.push("- Calculation Formula:");
  L.push("  • Birth Number = Single-digit sum of birth day only (e.g. 22nd -> 2+2 = 4).");
  L.push("  • Life Path Number = Single-digit sum of all digits in full DOB DD/MM/YYYY (e.g. 22/10/1993 -> 2+2+1+0+1+9+9+3 = 27 -> 2+7 = 9).");
  L.push("- Planetary scoreSum: 1:Sun (Leadership), 2:Moon (Harmony), 3:Jupiter (Wealth), 4:Rahu (Tech), 5:Mercury (Business/Sales - Best for Commerce), 6:Venus (Luxury/Fame - Top VIP), 7:Ketu (Spiritual), 8:Saturn (Stability), 9:Mars (Energy).");
  L.push("- If customer provides DOB: briefly show Birth Number & Life Path Number calculation, explain the vibration in 2 quick bullet points, output SEARCH_JSON with scoreSum=Life Path Number, and include: \"📊 For a full personalized Numerology Report (name vibration, digit frequency, full DOB reading), visit: https://www.numberwale.com/numerology-report\"");
  L.push("</knowledge_base>");

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
          temperature: 0.25,
          max_tokens: 400,
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
        temperature: 0.25,
        max_tokens: 400,
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
