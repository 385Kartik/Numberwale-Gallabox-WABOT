import { extractFiltersFromQuery } from './queryRules.js';

// ─────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Parsed directly in WABOT (Independent of backend)
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Parse natural language VIP number search queries into JSON. Output ONLY raw JSON, no markdown.

Schema (omit null fields):
{"category":"without-248-numbers|mirror-numbers|semi-mirror-numbers|three-digit-numbers|two-digit-numbers|counting-numbers|doubling-numbers|triple-numbers|tetra-numbers|penta-numbers|hexa-numbers|septa-numbers|octa-numbers|abc-abc-abc-numbers|abc-abc-numbers|ab-ab-ab-numbers|start-ab-ab-numbers|middle-ab-ab-numbers|ending-ab-ab-numbers|aaa-bbb-numbers|ab-ab-xy-xy-numbers|108-numbers|786-numbers|unique-numbers|null","startsWith":"string|null","endsWith":"string|null","anywhere":"string|null","mustContain":"string|null","notContain":"string|null","literSum":"number|null","trapSum":"number|null","scoreSum":"number|null","minPrice":"number|null","maxPrice":"number|null","exactDigitPlacement":"10-char string using ? for wildcards|null","mostContainDigit":"string|null","mostContainCount":"number|null","digitFreq1Digit":"string|null","digitFreq1Count":"number|null","digitFreq1MaxCount":"number|null"}

Rules:
1. If user says "ending with X", "X ending", or "last X", set "endsWith": "X".
2. If user says "starting with X", "X starting", or "first X", set "startsWith": "X".
3. If user says "containing X" or just "X", set "anywhere": "X" (unless it is a known category like 786).
4. DO NOT hallucinate categories! If they ask for "706", do NOT map it to "786-numbers". Only map to "786-numbers" if they explicitly say "786".
5. scoreSum = numerology total (1-9), literSum = exact digit sum.
6. "starting/ending [pattern]" → startsWith/endsWith with keyword (e.g. DOUBLE, PENTA).

Examples:
"req 706 ending" → {"endsWith":"706"}
"starting 98 and ending with 00" → {"startsWith":"98","endsWith":"00"}
"mirror numbers" → {"category":"mirror-numbers"}
"99 two times avoid 2480 total 5" → {"digitFreq1Digit":"99","digitFreq1Count":2,"notContain":"2480","scoreSum":5}
"budget 1000 to 5000" → {"minPrice":1000,"maxPrice":5000}
"four zeros together" → {"anywhere":"0000"}
"786 chahiye aur 99 bhi hona chahiye" → {"category":"786-numbers","mustContain":"99"}`;

// ─────────────────────────────────────────────────────────────────
// SLOT REGISTRY — builds all (model × key) combinations
// ─────────────────────────────────────────────────────────────────
function buildGroqSlots(models) {
  const keyNames = ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4"];
  const availableKeyNames = keyNames.filter(k => process.env[k] && process.env[k].trim().length > 0);

  const slots = [];
  for (const model of models) {
    for (const keyName of availableKeyNames) {
      slots.push({
        id: `groq:${model}#${keyName}`,
        provider: "groq",
        model,
        apiKey: process.env[keyName],
        url: "https://api.groq.com/openai/v1/chat/completions",
        maxTokens: 500,
      });
    }
  }
  return slots;
}

function buildSingleKeySlots(configs) {
  const slots = [];
  for (const cfg of configs) {
    const key = process.env[cfg.envKey] || (cfg.envKey === "OPENAI_API_KEY" ? process.env.OPENAI : undefined);
    if (!key || key.trim().length === 0) continue;
    slots.push({
      id: `${cfg.provider}:${cfg.model}`,
      provider: cfg.provider,
      model: cfg.model,
      apiKey: key,
      url: cfg.url,
      maxTokens: cfg.maxTokens || 500,
      extraHeaders: cfg.extraHeaders || {},
    });
  }
  return slots;
}

// ─────────────────────────────────────────────────────────────────
// SMART LOAD BALANCER — slot state tracking
// ─────────────────────────────────────────────────────────────────
const COOLDOWN_MS = {
  rateLimit: 60_000,   // 1 min cooldown after 429
  error: 5_000,        // 5 sec cooldown after generic error
};

class LoadBalancer {
  constructor() {
    this.state = new Map();
    this._rrCounter = 0;
  }

  getState(slotId) {
    if (!this.state.has(slotId)) {
      this.state.set(slotId, { inflight: 0, cooldownUntil: 0, failures: 0 });
    }
    return this.state.get(slotId);
  }

  isAvailable(slotId) {
    const s = this.getState(slotId);
    return Date.now() >= s.cooldownUntil;
  }

  pickBest(slots) {
    const available = slots.filter(s => this.isAvailable(s.id));
    if (available.length === 0) return null;

    available.sort((a, b) => {
      const ia = this.getState(a.id).inflight;
      const ib = this.getState(b.id).inflight;
      return ia - ib;
    });

    const minInflight = this.getState(available[0].id).inflight;
    const tied = available.filter(s => this.getState(s.id).inflight === minInflight);
    return tied[this._rrCounter++ % tied.length];
  }

  markInflight(slotId, delta) {
    const s = this.getState(slotId);
    s.inflight = Math.max(0, s.inflight + delta);
  }

  markSuccess(slotId) {
    const s = this.getState(slotId);
    s.failures = 0;
    s.cooldownUntil = 0;
    s.inflight = Math.max(0, s.inflight - 1);
  }

  markRateLimit(slotId) {
    const s = this.getState(slotId);
    s.failures++;
    s.cooldownUntil = Date.now() + COOLDOWN_MS.rateLimit;
    s.inflight = Math.max(0, s.inflight - 1);
    console.warn(`⛔ [AI-LB] Rate-limited: ${slotId} | cooldown 60s`);
  }

  markError(slotId) {
    const s = this.getState(slotId);
    s.failures++;
    s.cooldownUntil = Date.now() + COOLDOWN_MS.error * s.failures;
    s.inflight = Math.max(0, s.inflight - 1);
  }

  getStats() {
    const out = {};
    for (const [id, s] of this.state.entries()) {
      const cooldownLeft = Math.max(0, s.cooldownUntil - Date.now());
      out[id] = {
        inflight: s.inflight,
        failures: s.failures,
        cooldownLeft: cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 1000)}s` : null,
      };
    }
    return out;
  }
}

const LB = new LoadBalancer();

// ─────────────────────────────────────────────────────────────────
// SLOT DEFINITIONS (Active Production Models)
// ─────────────────────────────────────────────────────────────────
const GROQ_TIER1_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile'
];

const OPENROUTER_TIER2_CONFIGS = [
  { provider: "openrouter", model: "openrouter/free",                            envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nex-agi/nex-n2-pro:free",                    envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "openai/gpt-oss-120b:free",                   envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free",                 envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "poolside/laguna-m.1:free",                   envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free",     envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "google",     model: "gemini-2.0-flash",                           envKey: "GOOGLE_API_KEY_FLASH", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" },
];

const OPENROUTER_TIER3_CONFIGS = [
  { provider: "openrouter", model: "openai/gpt-oss-20b:free",                         envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "qwen/qwen3-coder:free",                           envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nvidia/nemotron-3-nano-30b-a3b:free",             envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nvidia/nemotron-nano-9b-v2:free",                 envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "google/gemma-4-26b-a4b-it:free",                  envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "qwen/qwen3-next-80b-a3b-instruct:free",           envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free",          envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "nousresearch/hermes-3-llama-3.1-405b:free",       envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "liquid/lfm-2.5-1.2b-thinking:free",               envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
  { provider: "openrouter", model: "poolside/laguna-xs.2:free",                       envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", extraHeaders: { "HTTP-Referer": "https://numberwale.com", "X-Title": "Numberwale Bot Search" } },
];

// Tier 4: Guaranteed Paid Safety Net Fallback (OpenAI gpt-4o-mini)
const OPENAI_TIER4_CONFIGS = [
  { provider: "openai", model: "gpt-4o-mini", envKey: "OPENAI_API_KEY", url: "https://api.openai.com/v1/chat/completions", maxTokens: 500 },
];

let SLOTS_BUILT = false;
let TIER1_SLOTS = [];
let TIER2_SLOTS = [];
let TIER3_SLOTS = [];
let TIER4_SLOTS = [];

function ensureSlotsBuilt() {
  if (SLOTS_BUILT) return;
  TIER1_SLOTS = buildGroqSlots(GROQ_TIER1_MODELS);
  TIER2_SLOTS = buildSingleKeySlots(OPENROUTER_TIER2_CONFIGS);
  TIER3_SLOTS = buildSingleKeySlots(OPENROUTER_TIER3_CONFIGS);
  TIER4_SLOTS = buildSingleKeySlots(OPENAI_TIER4_CONFIGS);
  console.info(`[AI-LB] Local slots built — Tier1:${TIER1_SLOTS.length} Tier2:${TIER2_SLOTS.length} Tier3:${TIER3_SLOTS.length} Tier4(OpenAI):${TIER4_SLOTS.length}`);
  SLOTS_BUILT = true;
}

// ─────────────────────────────────────────────────────────────────
// HTTP + CLEAN HELPERS
// ─────────────────────────────────────────────────────────────────
function isRateLimitError(status) {
  return [429, 503, 529].includes(status);
}

async function fetchWithTimeout(url, options, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanResponse(text) {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

async function callSlot(slot, userQuery, activeFilters) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${slot.apiKey}`,
    ...(slot.extraHeaders || {}),
  };

  let finalSystemPrompt = SYSTEM_PROMPT;
  if (activeFilters && Object.keys(activeFilters).length > 0) {
    finalSystemPrompt += `\n\nCURRENT ACTIVE FILTERS: ${JSON.stringify(activeFilters)}\n\nYou are a STATEFUL parser. The user already has filters active (shown above).\nYou MUST decide: is the new message a REFINEMENT or a NEW SEARCH?\n\nDECISION RULES:\n1. REFINEMENT — user is ADDING/CHANGING one constraint on the same search:\n   Signs: "under X", "above X", "must have", "avoid", "with", "starting", "ending", "budget"\n   Action: Output the FULL merged JSON = current filters + new constraint.\n   Example: current={endsWith:"7654"}, user says "under 10000" -> output {endsWith:"7654",maxPrice:10000}\n   Example: current={endsWith:"7654",maxPrice:10000}, user says "must have 9" -> output {endsWith:"7654",maxPrice:10000,mustContain:"9"}\n\n2. NEW SEARCH — user wants completely different numbers:\n   Signs: they name a new category, new starting/ending digits that conflict with current, or use words like "want", "need", "show me X", "req X", "get me X" with a different pattern.\n   Action: DISCARD all current filters. Output ONLY the new JSON.\n   Example: current={endsWith:"7654"}, user says "786 numbers" -> output {category:"786-numbers"}\n   Example: current={maxPrice:5000}, user says "mirror numbers" -> output {category:"mirror-numbers"}\n\n3. UNCLEAR — if you genuinely cannot tell, treat as REFINEMENT (safer).\n\nOutput ONLY the final complete JSON. No explanation.`;
  }

  const requestBody = {
    model: slot.model,
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: userQuery + "\n\nCRITICAL: Output ONLY valid JSON starting with { and ending with }. Do NOT write any conversational text, explanations, or markdown. Output raw JSON only." },
    ],
    temperature: 0,
    max_tokens: slot.maxTokens || 500,
  };

  const response = await fetchWithTimeout(slot.url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const isRL = isRateLimitError(response.status);
    let errData = {};
    try { errData = await response.json(); } catch (e) {}
    const message = errData?.error?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.isRateLimit = isRL;
    throw error;
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || data.choices?.[0]?.message?.reasoning;

  if (!text) throw new Error("Empty response from model");
  return cleanResponse(text);
}

async function callSlotForChat(slot, systemPrompt, messages, maxTokens = 350, temperature = 0.5) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${slot.apiKey}`,
    ...(slot.extraHeaders || {}),
  };

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages
  ];

  const requestBody = {
    model: slot.model,
    messages: formattedMessages,
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetchWithTimeout(slot.url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  }, 3500);

  if (!response.ok) {
    const isRL = isRateLimitError(response.status);
    let errData = {};
    try { errData = await response.json(); } catch (e) {}
    const message = errData?.error?.message || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.isRateLimit = isRL;
    throw error;
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning_content
    || data.choices?.[0]?.message?.reasoning;

  if (!text) throw new Error("Empty response from model");
  return text.trim();
}

export async function runLocalAgentChat({ systemPrompt, messages, maxTokens = 350, temperature = 0.5 }) {
  ensureSlotsBuilt();

  const tiers = [TIER1_SLOTS, TIER2_SLOTS, TIER3_SLOTS, TIER4_SLOTS];
  const tried = [];

  for (const tierSlots of tiers) {
    if (tierSlots.length === 0) continue;

    let attempts = 0;
    const maxAttempts = tierSlots.length;

    while (attempts < maxAttempts) {
      const slot = LB.pickBest(tierSlots);
      if (!slot) break;

      if (tried.includes(slot.id)) break;
      tried.push(slot.id);
      attempts++;

      LB.markInflight(slot.id, +1);

      console.log(`[AI-AGENT] 🚀 Attempting LLM Chat via [${slot.id}] (${slot.model})...`);
      const t0Slot = Date.now();
      try {
        const text = await callSlotForChat(slot, systemPrompt, messages, maxTokens, temperature);
        LB.markSuccess(slot.id);
        console.log(`[AI-AGENT] ✅ Served by [${slot.id}] in ${Date.now() - t0Slot}ms`);
        return text;
      } catch (err) {
        if (err.isRateLimit) {
          LB.markRateLimit(slot.id);
          console.error(`[AI-AGENT] ⛔ Rate limit on [${slot.id}] in ${Date.now() - t0Slot}ms -> Trying next model...`);
        } else {
          LB.markError(slot.id);
          console.error(`[AI-AGENT] ❌ Error on [${slot.id}] in ${Date.now() - t0Slot}ms: ${err.message} -> Falling back to next model...`);
        }
        continue;
      }
    }
  }

  throw new Error(`All AI chat slots exhausted. Tried: ${tried.join(", ")}`);
}

async function runLocalAISearch(userQuery, activeFilters) {
  ensureSlotsBuilt();

  const tiers = [TIER1_SLOTS, TIER2_SLOTS, TIER3_SLOTS, TIER4_SLOTS];
  const tried = [];

  for (const tierSlots of tiers) {
    if (tierSlots.length === 0) continue;

    let attempts = 0;
    const maxAttempts = tierSlots.length;

    while (attempts < maxAttempts) {
      const slot = LB.pickBest(tierSlots);
      if (!slot) break;

      if (tried.includes(slot.id)) break;
      tried.push(slot.id);
      attempts++;

      LB.markInflight(slot.id, +1);

      console.log(`[AI-LB] 🚀 Attempting AI Search Parse via [${slot.id}] (${slot.model})...`);
      const t0Slot = Date.now();
      try {
        const result = await callSlot(slot, userQuery, activeFilters);
        LB.markSuccess(slot.id);
        console.log(`[AI-LB] ✅ Served by [${slot.id}] in ${Date.now() - t0Slot}ms`);
        return { result, model: slot.id };
      } catch (err) {
        if (err.isRateLimit) {
          LB.markRateLimit(slot.id);
          console.error(`[AI-LB] ⛔ Rate limit on [${slot.id}] in ${Date.now() - t0Slot}ms -> Trying next model...`);
        } else {
          LB.markError(slot.id);
          console.error(`[AI-LB] ❌ Error on [${slot.id}] in ${Date.now() - t0Slot}ms: ${err.message} -> Falling back to next model...`);
        }
        continue;
      }
    }
  }

  throw new Error(`All AI slots exhausted. Tried: ${tried.join(", ")}`);
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC PARSER API
// ─────────────────────────────────────────────────────────────────
export async function parseUserMessage(query, activeFilters = {}) {
  const userMsg = query.trim();

  // 🧠 0. Rule Engine (Zero-Cost Bypass) 🧠
  const { extracted, confident } = extractFiltersFromQuery(userMsg);
  const hasActiveFilters = activeFilters && Object.keys(activeFilters).length > 0;

  // If rules are 100% confident and no active filters exist, skip LLM entirely
  if (confident && !hasActiveFilters) {
    console.log(`[AI] ⚡ Skipped LLM — Rules confident:`, extracted);
    return {
      result: extracted,
      model: "rules-engine",
      tokensUsed: 0
    };
  }

  // ── 1. Local AI Search Engine (Multi-Tier Load Balancer with OpenAI Fallback) ──
  try {
    const { result, model } = await runLocalAISearch(userMsg, activeFilters);
    let aiParsed = {};
    try {
      aiParsed = typeof result === 'string' ? JSON.parse(result) : result;
    } catch (_) {}

    // Merge rule-extracted fields (they take priority for precision)
    const merged = { ...aiParsed, ...extracted };
    return {
      result: merged,
      model,
      tokensUsed: 0,
    };
  } catch (err) {
    console.error(`[AI] ⚠️ ALL LLM Search slots failed: ${err.message}`);

    // ── 2. Fallback: Rule Engine (Regex Safety Net) ──
    if (Object.keys(extracted).length > 0) {
      console.log(`[RULES] 🔄 FALLBACK TRIGGERED: Using regex rule extraction:`, extracted);
      return {
        result: extracted,
        model: "rules-engine-fallback",
        tokensUsed: 0
      };
    }

    const digitsOnly = userMsg.replace(/\D/g, '');
    if (digitsOnly.length > 0) {
      console.log(`[RULES] 🔄 FALLBACK TRIGGERED: Using raw digits safety net: ${digitsOnly}`);
      return {
        result: { anywhere: digitsOnly },
        model: "digits-safety-net",
        tokensUsed: 0
      };
    }

    throw new Error("AI search failed: " + err.message);
  }
}
