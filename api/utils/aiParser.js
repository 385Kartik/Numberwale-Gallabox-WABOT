import Groq from "groq-sdk";

export async function parseUserMessage(query) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("GROQ_API_KEY is not defined in environment variables.");
  }

  const groq = new Groq({ apiKey: groqKey });

  // ⚠️ This system prompt MUST stay in sync with AISearch.jsx on the website!
  const systemPrompt = `You are a highly precise natural language parser for a VIP mobile number search engine.
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
  "digitFreq1Count": "number | null"
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
9. "ending penta numbers"
   {"endsWith":"PENTA"}
10. "starting with triple"
   {"startsWith":"TRIPLE"}

CRITICAL RULES:
1. A query like "222" or "req 222" means the sequence "222" must appear exactly as is (continuously). Map this to {"anywhere":"222"}.
2. DO NOT map "222" to {"digitFreq1Digit":"2", "digitFreq1Count":3}. Only use digitFreq if the user explicitly asks for "2 three times", "three 2s", etc.
3. Return strictly ONLY JSON. If the user types a category name without spaces (like 'ababxyxy' or 'mirror'), fuzzy match it to the closest valid category slug.
4. For requests like "starting double", "ending mirror", "starting counting numbers", "ending penta", etc., DO NOT use the category field. Instead, set the "startsWith" or "endsWith" field to the exact capitalized keyword. Supported keywords: "DOUBLE", "TRIPLE", "TETRA", "PENTA", "HEXA", "SEPTA", "OCTA", "COUNTING", "DOUBLING", "ABC_ABC", "ABC_ABC_ABC", "AB_AB", "AB_AB_AB", "AAA_BBB", "AB_AB_XY_XY", "MIRROR", "SEMI_MIRROR".`;

  // ⚠️ These models MUST stay in sync with AISearch.jsx on the website!
  const groqModels = [
    'llama-3.3-70b-versatile',
    'qwen/qwen3-32b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.1-8b-instant'
  ];

  let resultText = null;

  for (const model of groqModels) {
    try {
      console.log(`[AI] Attempting parse with ${model}...`);
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query.trim() }
        ],
        model: model,
        temperature: 0,
        response_format: { type: "json_object" }
      });

      resultText = completion.choices[0]?.message?.content;
      if (resultText) {
        console.log(`[AI] Successfully parsed with ${model}`);
        break; 
      }
    } catch (error) {
      console.warn(`[AI] Model ${model} failed:`, error.message);
    }
  }

  if (!resultText) {
    throw new Error("Failed to parse message using all available Groq models.");
  }

  try {
    return JSON.parse(resultText);
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + resultText);
  }
}
