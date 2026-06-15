import Groq from "groq-sdk";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN-OPTIMIZED SYSTEM PROMPT
// Compact but complete — same rules as AISearch.jsx, far fewer tokens.
// ⚠️  Keep in sync with AISearch.jsx on the website!
// ─────────────────────────────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `Parse VIP mobile number search query into JSON. Output ONLY raw JSON, no markdown.

Fields (omit if not needed):
category: one of [without-248-numbers,mirror-numbers,semi-mirror-numbers,three-digit-numbers,two-digit-numbers,counting-numbers,doubling-numbers,triple-numbers,tetra-numbers,penta-numbers,hexa-numbers,septa-numbers,octa-numbers,abc-abc-abc-numbers,abc-abc-numbers,ab-ab-ab-numbers,start-ab-ab-numbers,middle-ab-ab-numbers,ending-ab-ab-numbers,aaa-bbb-numbers,ab-ab-xy-xy-numbers,108-numbers,786-numbers,unique-numbers]
startsWith,endsWith,anywhere,mustContain,notContain: string
literSum,trapSum,scoreSum,minPrice,maxPrice: number
exactDigitPlacement: 10-char string with ? for wildcards e.g. 98????????
digitFreq1Digit,mostContainDigit: string
digitFreq1Count,mostContainCount: number

Rules:
- "req 222" or "222" → {anywhere:"222"} NOT digitFreq
- Use digitFreq only for "X times" / "X three times" etc.
- "starting/ending triple/penta/mirror..." → startsWith/endsWith:"TRIPLE"/"PENTA"/"MIRROR" etc. Keywords: DOUBLE,TRIPLE,TETRA,PENTA,HEXA,SEPTA,OCTA,COUNTING,DOUBLING,ABC_ABC,ABC_ABC_ABC,AB_AB,AB_AB_AB,AAA_BBB,AB_AB_XY_XY,MIRROR,SEMI_MIRROR
- "under/below/less than X" → maxPrice:X
- "above/over/more than X" → minPrice:X
- "budget X to Y" → minPrice:X, maxPrice:Y
- scoreSum is single digit 1-9 (numerology total)
- literSum = sum of all 10 digits exactly

Examples:
"mirror numbers"→{"category":"mirror-numbers"}
"99 two times avoid 2480 total 5"→{"digitFreq1Digit":"99","digitFreq1Count":2,"notContain":"2480","scoreSum":5}
"starts 98 ends 00"→{"startsWith":"98","endsWith":"00"}
"budget 1000 to 5000"→{"minPrice":1000,"maxPrice":5000}
"7 three times"→{"digitFreq1Digit":"7","digitFreq1Count":3}
"four zeros together"→{"anywhere":"0000"}
"req 555 under 10000"→{"anywhere":"555","maxPrice":10000}
"ending penta"→{"endsWith":"PENTA"}
"mujhe 786 chahiye aur 99 bhi ho"→{"anywhere":"786","mustContain":"99"}`;

// Build context-aware prompt by merging previousState minimally
function buildPrompt(previousState) {
  if (!previousState || Object.keys(previousState).length === 0) {
    return BASE_SYSTEM_PROMPT;
  }
  // Only inject the previous state — keep it short
  return `${BASE_SYSTEM_PROMPT}

Previous search: ${JSON.stringify(previousState)}
If new message refines it (e.g. "under 10000"), MERGE. If new search, IGNORE previous.`;
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

export async function parseUserMessage(query, previousState = null) {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    throw new Error("AI API keys missing. Add GROQ_API_KEY or OPENAI_API_KEY to env.");
  }

  const systemPrompt = buildPrompt(previousState);
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
