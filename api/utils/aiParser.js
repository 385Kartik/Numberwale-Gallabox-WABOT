import Groq from "groq-sdk";

// FULL SYSTEM PROMPT — Synced exactly with AISearch.jsx on the website
const BASE_SYSTEM_PROMPT = `You are a highly precise natural language parser for a VIP mobile number search engine.
Your job is to read the user's natural language request and output a valid JSON object matching the advanced search schema.
Do NOT output any markdown, markdown code blocks, explanations, or additional text. Output ONLY raw JSON.

Schema definition (only include fields if explicitly requested or logically implied):
{
  "category": "string (MUST BE EXACTLY ONE OF: 'without-248-numbers', 'mirror-numbers', 'semi-mirror-numbers', 'three-digit-numbers', 'two-digit-numbers', 'counting-numbers', 'doubling-numbers', 'triple-numbers', 'tetra-numbers', 'penta-numbers', 'hexa-numbers', 'septa-numbers', 'octa-numbers', 'abc-abc-abc-numbers', 'abc-abc-numbers', 'ab-ab-ab-numbers', 'start-ab-ab-numbers', 'middle-ab-ab-numbers', 'ending-ab-ab-numbers', 'aaa-bbb-numbers', 'ab-ab-xy-xy-numbers', '108-numbers', '786-numbers', 'unique-numbers') | null",
  "startsWith": "string (max 10 digits) | null",
  "endsWith": "string (max 10 digits) | null",
  "anywhere": "string | null",
  "mustContain": "string (max 5 digits, comma separated if needed) | null",
  "notContain": "string (max 5 digits, comma separated if needed) | null",
  "literSum": "number | null (use ONLY if user asks for exact sum of all 10 digits, e.g. sum 50)",
  "trapSum": "number | null",
  "scoreSum": "number | null (use this for 'total X' or 'numerology total X'. It's a single digit 1-9)",
  "minPrice": "number | null",
  "maxPrice": "number | null",
  "exactDigitPlacement": "string (exact 10 chars long, use '?' for any digit, e.g., '98????????') | null",
  "mostContainDigit": "string | null",
  "mostContainCount": "number | null",
  "digitFreq1Digit": "string | null",
  "digitFreq1Count": "number | null",
  "digitFreq1MaxCount": "number | null"
}

Examples:
1. "i want mirror numbers"
   {"category":"mirror-numbers"}
2. "99 two times, avoid 2480 and total should be 5"
   {"digitFreq1Digit":"99","digitFreq1Count":2,"notContain":"2480","scoreSum":5}
3. "starts with 98 and ends with 00"
   {"startsWith":"98","endsWith":"00"}
4. "budget 1000 to 5000"
   {"minPrice":1000,"maxPrice":5000}
5. "must have 7 at least 3 times"
   {"digitFreq1Digit":"7","digitFreq1Count":3}
6. "four zeros together"
   {"anywhere":"0000"}
7. "req 222" or "222"
   {"anywhere":"222"}
8. "2 three times"
   {"digitFreq1Digit":"2","digitFreq1Count":3}
9. "77 two times"
   {"digitFreq1Digit":"77","digitFreq1Count":2}
10. "786 numbers"
    {"category":"786-numbers"}
11. "mirror numbers under 10000"
    {"category":"mirror-numbers","maxPrice":10000}

CRITICAL RULES:
1. A query like "222" or "req 222" means the sequence "222" must appear exactly (continuously). Map to {"anywhere":"222"}.
2. DO NOT map "222" to digitFreq. Only use digitFreq if user says "2 three times", "three 2s", "77 two times" etc.
3. Return strictly ONLY JSON. Fuzzy match category names (e.g. 'mirror' → 'mirror-numbers').
4. For "starting double", "ending mirror" etc., use startsWith/endsWith with keywords: "DOUBLE","TRIPLE","TETRA","PENTA","HEXA","SEPTA","OCTA","COUNTING","DOUBLING","ABC_ABC","ABC_ABC_ABC","AB_AB","AB_AB_AB","AAA_BBB","AB_AB_XY_XY","MIRROR","SEMI_MIRROR".
5. If completely unrelated query, return {}.`;

// Build context-aware prompt by injecting previous JSON state
function buildPrompt(activeFilters) {
  let prompt = BASE_SYSTEM_PROMPT;
  if (activeFilters && Object.keys(activeFilters).length > 0) {
    prompt += `

CURRENT ACTIVE FILTERS: ${JSON.stringify(activeFilters)}

You are a STATEFUL parser. The user already has filters active (shown above).
You MUST decide: is the new message a REFINEMENT or a NEW SEARCH?

DECISION RULES:
1. REFINEMENT — user is ADDING/CHANGING one constraint on the same search:
   Signs: "under X", "above X", "must have", "avoid", "with", "starting", "ending", "budget"
   Action: Output the FULL merged JSON = current filters + new constraint.
   Example: current={endsWith:"7654"}, user says "under 10000" → output {endsWith:"7654",maxPrice:10000}
   Example: current={endsWith:"7654",maxPrice:10000}, user says "must have 9" → output {endsWith:"7654",maxPrice:10000,mustContain:"9"}

2. NEW SEARCH — user wants completely different numbers:
   Signs: they name a new category, new starting/ending digits that conflict with current, or use words like "want", "need", "show me X", "req X", "get me X" with a different pattern.
   Action: DISCARD all current filters. Output ONLY the new JSON.
   Example: current={endsWith:"7654"}, user says "786 numbers" → output {category:"786-numbers"}
   Example: current={maxPrice:5000}, user says "mirror numbers" → output {category:"mirror-numbers"}

3. UNCLEAR — if you genuinely cannot tell, treat as REFINEMENT (safer).

Output ONLY the final complete JSON. No explanation.`;
  }
  return prompt;
}

// MODEL PRIORITY: Cheapest & fastest first
const GROQ_MODELS = [
  'llama-3.1-8b-instant',          // Fastest — JS force-merge handles context anyway
  'llama-3.3-70b-versatile',       // Fallback if 8b fails
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b'
];

let groqRoundRobinIndex = 0;

import { extractFiltersFromQuery } from './queryRules.js';

export async function parseUserMessage(query, activeFilters = {}) {
  const openaiKey = process.env.OPENAI_API_KEY;

  // Retrieve available Groq keys
  const groqKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4
  ].filter(key => key && key.trim().length > 0);

  if (groqKeys.length === 0 && !openaiKey) {
    throw new Error("AI API keys missing. Add GROQ_API_KEY or OPENAI_API_KEY to env.");
  }

  const userMsg = query.trim();

  // 🧠 0. Rule Engine (Zero-Cost Bypass) 🧠
  const { extracted, confident } = extractFiltersFromQuery(userMsg);
  const hasActiveFilters = activeFilters && Object.keys(activeFilters).length > 0;
  
  // Only bypass LLM if there are NO active filters.
  // If there are active filters, we rely on the LLM to intelligently decide 
  // whether to merge (refinement) or discard (new search).
  if (confident && !hasActiveFilters) {
    console.log(`[AI] ⚡ Skipped LLM — Rules confident:`, extracted);
    return {
      result: extracted,
      model: "rules-engine",
      tokensUsed: 0
    };
  }

  const systemPrompt = buildPrompt(activeFilters);

  // ── 1. Try Groq (cheapest first) ─────────────────────────────────────────
  if (groqKeys.length > 0) {
    // Pick the next key in the sequence
    const currentKey = groqKeys[groqRoundRobinIndex % groqKeys.length];
    groqRoundRobinIndex++;

    const groq = new Groq({ apiKey: currentKey });

    for (const model of GROQ_MODELS) {
      try {
        console.log(`[AI] Trying ${model} with key index ${(groqRoundRobinIndex - 1) % groqKeys.length}...`);
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg }
          ],
          temperature: 0,
          max_tokens: 200,
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
  }

  // ── 2. Fallback: OpenAI (gpt-4o-mini) ──
  if (openaiKey) {
    try {
      console.log(`[AI] All Groq models failed. Falling back to OpenAI (gpt-4o-mini)...`);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg }
          ],
          temperature: 0,
          max_tokens: 200,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content;
      
      if (text) {
        console.log(`[AI] ✅ Parsed with gpt-4o-mini | tokens: ${data.usage?.total_tokens ?? '?'}`);
        return {
          result: JSON.parse(text),
          model: "gpt-4o-mini",
          tokensUsed: data.usage?.total_tokens ?? 0,
        };
      }
    } catch (err) {
      console.error(`[AI] OpenAI fallback failed: ${err.message}`);
    }
  }

  throw new Error("All AI models (Groq & OpenAI) failed.");
}
