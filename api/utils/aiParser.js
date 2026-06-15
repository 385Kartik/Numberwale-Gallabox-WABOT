import Groq from "groq-sdk";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN-OPTIMIZED SYSTEM PROMPT
// Compact but complete — same rules as AISearch.jsx, far fewer tokens.
// ⚠️  Keep in sync with AISearch.jsx on the website!
// ─────────────────────────────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `Parse VIP mobile number search query into JSON. Output ONLY raw JSON. Omit empty fields.

Valid categories (must end with -numbers):
without-248, mirror, semi-mirror, three-digit, two-digit, counting, doubling, triple, tetra, penta, hexa, septa, octa, abc-abc-abc, abc-abc, ab-ab-ab, start-ab-ab, middle-ab-ab, ending-ab-ab, aaa-bbb, ab-ab-xy-xy, 108, 786, unique

Fields:
category, startsWith, endsWith, anywhere, mustContain, notContain, literSum, trapSum, scoreSum, minPrice, maxPrice, exactDigitPlacement, digitFreq1Digit, digitFreq1Count

Rules:
- "222" => anywhere:"222"
- freq only when "X times"
- under X => maxPrice
- 786 => category:"786-numbers"
- unrelated => {}

Examples:
"mirror"→{"category":"mirror-numbers"}
"786 with 55"→{"category":"786-numbers", "mustContain":"55"}
"req 555"→{"anywhere":"555"}`;

function buildPrompt(activeFilters) {
  let prompt = BASE_SYSTEM_PROMPT;
  if (activeFilters && Object.keys(activeFilters).length > 0) {
    prompt += `\n\nCURRENT FILTERS STATE: ${JSON.stringify(activeFilters)}
CRITICAL INSTRUCTION:
- If user refines the search (e.g., "under 10k", "must contain 9"), output a JSON that KEEPS the current filters and adds the new ones.
- If user starts a new search (e.g., "mirror numbers", "req 555"), DISCARD the current state and return only the new JSON.
You MUST output the final complete JSON.`;
  }
  return prompt;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL PRIORITY:
// Cheapest & fastest first to minimize token cost.
// Larger models only as fallback if smaller ones fail.
// ─────────────────────────────────────────────────────────────────────────────
const GROQ_MODELS = [
  'llama-3.1-8b-instant',          // Fastest + cheapest — handles most queries fine
  'llama-3.3-70b-versatile',       // Better for complex Hindi/mixed queries
  'meta-llama/llama-4-scout-17b-16e-instruct', // Scout — good balance
];

export async function parseUserMessage(query, history = []) {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    throw new Error("AI API keys missing. Add GROQ_API_KEY or OPENAI_API_KEY to env.");
  }

  const systemPrompt = buildPrompt(history);
  const userMsg = query.trim();
  let resultText = null;

  // ── 1. Try Groq (cheapest first) ─────────────────────────────────────────
  if (groqKey) {
    const groq = new Groq({ apiKey: groqKey });

    for (const model of GROQ_MODELS) {
      try {
        console.log(`[AI] Trying ${model}...`);
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg }
          ],
          temperature: 0,
          max_tokens: 150,  // JSON output is always tiny — cap tokens hard
          response_format: { type: "json_object" }
        });

        const text = completion.choices[0]?.message?.content;
        if (text) {
          console.log(`[AI] ✅ Parsed with ${model} | tokens: ${completion.usage?.total_tokens ?? '?'}`);
          return {
            result: JSON.parse(text),
            model,
            tokensUsed: completion.usage?.total_tokens ?? 0,
          };
        }
      } catch (err) {
        console.warn(`[AI] ${model} failed: ${err.message}`);
      }
    }
  } else {
    console.warn("[AI] No GROQ_API_KEY — skipping to fallback.");
  }

  // ── 2. Fallback: OpenAI gpt-4o-mini ──────────────────────────────────────
  if (!openaiKey) {
    throw new Error("All Groq models failed and OPENAI_API_KEY is not set.");
  }
  try {
    console.log("[AI] Falling back to OpenAI gpt-4o-mini...");
    const { default: axios } = await import('axios');
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg }
        ],
        temperature: 0,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const text = response.data.choices?.[0]?.message?.content;
    if (text) {
      console.log("[AI] ✅ Parsed with OpenAI gpt-4o-mini");
      return {
        result: JSON.parse(text),
        model: 'openai/gpt-4o-mini',
        tokensUsed: response.data.usage?.total_tokens ?? 0,
      };
    }
  } catch (err) {
    console.error("[AI] OpenAI fallback failed:", err.response?.data || err.message);
    throw new Error("AI parsing failed across all models.");
  }

  throw new Error("All AI models returned empty response.");
}
