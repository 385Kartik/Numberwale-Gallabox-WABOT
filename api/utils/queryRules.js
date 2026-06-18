'use strict';

/**
 * queryRules.js — Zero-cost rule-based NLP extractor for VIP number search
 *
 * Goal: Cover ~90% of real queries using pure regex/logic so LLM is called
 * only for genuinely ambiguous cases.
 *
 * Coverage:
 *   ✅ category (23 categories, English + Hindi)
 *   ✅ startsWith / endsWith (incl. pattern keywords: DOUBLE, TRIPLE, etc.)
 *   ✅ anywhere  ("req 555", "containing 786", pure-digit queries)
 *   ✅ mustContain / notContain
 *   ✅ digitFreq1Digit + digitFreq1Count  ("99 two times", "double 9")
 *   ✅ mostContainDigit + mostContainCount ("mostly 9", "maximum 9 times")
 *   ✅ scoreSum  (numerology total 1-9: "total 5", "ank 5")
 *   ✅ literSum  (exact digit sum: "digit sum 50", "sum of digits 32")
 *   ✅ minPrice / maxPrice  (budget ranges, Hindi price words)
 *   ✅ exactDigitPlacement  ("9 at position 3", "98 at start ?? 00 at end")
 *   ✅ "N digits together"  ("four zeros together" → anywhere:"0000")
 *   ✅ Hindi keyword support throughout
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twice: 2, thrice: 3, once: 1,
  do: 2, teen: 3, char: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
};

const DIGIT_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  shunya: '0', ek: '1', do: '2', teen: '3', char: '4',
  paanch: '5', chhe: '6', saat: '7', aath: '8', nau: '9',
};

// Pattern keywords used by the backend advanced-search engine
// e.g. endsWith: "DOUBLE" means number ends with a double-digit repeat
const PATTERN_KEYWORDS = [
  // Order matters — most specific first
  [/\bsemi[\s-]?mirror\b/i,   'SEMI_MIRROR'],
  [/\bmirror\b/i,              'MIRROR'],
  [/\bcounting\b|\bsequen/i,   'COUNTING'],
  [/\bdoubling\b/i,            'DOUBLING'],
  [/\babc[\s_-]?abc[\s_-]?abc\b/i, 'ABC_ABC_ABC'],
  [/\babc[\s_-]?abc\b/i,       'ABC_ABC'],
  [/\bab[\s_-]?ab[\s_-]?xy[\s_-]?xy\b/i, 'AB_AB_XY_XY'],
  [/\bab[\s_-]?ab[\s_-]?ab\b/i, 'AB_AB_AB'],
  [/\bab[\s_-]?ab\b/i,         'AB_AB'],
  [/\baaa[\s_-]?bbb\b/i,       'AAA_BBB'],
  [/\bocta\b/i,                'OCTA'],
  [/\bsepta\b/i,               'SEPTA'],
  [/\bhexa\b/i,                'HEXA'],
  [/\bpenta\b/i,               'PENTA'],
  [/\btetra\b/i,               'TETRA'],
  [/\btriple\b/i,              'TRIPLE'],
  [/\bdouble\b/i,              'DOUBLE'],
  [/\b(?:start(?:ing|s)?|first|shuru)\b/i, 'START'],
  [/\b(?:end(?:ing|s)?|last|khatam|aakhir)\b/i, 'END'],
];

function wordToNum(w) {
  if (!w) return null;
  const lw = w.trim().toLowerCase();
  if (/^\d+$/.test(lw)) return parseInt(lw, 10);
  return WORD_TO_NUM[lw] ?? null;
}

function wordToDigit(w) {
  if (!w) return null;
  const lw = w.trim().toLowerCase().replace(/e?s$/, ''); // strip plurals
  if (/^\d$/.test(lw)) return lw;
  return DIGIT_WORDS[lw] ?? null;
}

function matchPatternKeyword(text) {
  for (const [rx, kw] of PATTERN_KEYWORDS) {
    if (rx.test(text)) return kw;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CATEGORY
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_PATTERNS = [
  // Most specific first (prevents "mirror" from catching "semi-mirror")
  [/\bsemi[\s-]?mirror\b/i,                                          'semi-mirror-numbers'],
  [/\bmirror\b/i,                                                     'mirror-numbers'],
  [/\babc[\s_-]?abc[\s_-]?abc\b/i,                                   'abc-abc-abc-numbers'],
  [/\babc[\s_-]?abc\b/i,                                             'abc-abc-numbers'],
  [/\bab[\s_-]?ab[\s_-]?xy[\s_-]?xy\b/i,                            'ab-ab-xy-xy-numbers'],
  [/\bab[\s_-]?ab[\s_-]?ab\b/i,                                      'ab-ab-ab-numbers'],
  [/\bstart(?:ing)?\s*ab[\s_-]?ab\b/i,                               'start-ab-ab-numbers'],
  [/\bmiddle\s*ab[\s_-]?ab\b/i,                                      'middle-ab-ab-numbers'],
  [/\bending\s*ab[\s_-]?ab\b/i,                                      'ending-ab-ab-numbers'],
  [/\baaa[\s_-]?bbb\b/i,                                             'aaa-bbb-numbers'],
  [/\bab[\s_-]?ab\b/i,                                               'ab-ab-numbers'],
  [/\bwithout[\s-]?248\b|avoid\s*2[\s,]*4[\s,]*8\b|no\s*2\s*4\s*8\b/i, 'without-248-numbers'],
  [/\bthree[\s-]digit\b|\b3[\s-]digit\b/i,                           'three-digit-numbers'],
  [/\btwo[\s-]digit\b|\b2[\s-]digit\b/i,                             'two-digit-numbers'],
  [/\bcounting\b|\bsequential\b|\bsequence\b/i,                      'counting-numbers'],
  [/\bdoubling\b|\bdouble\b(?!\s*\d+\b)/i,                            'doubling-numbers'],
  [/\btriple\b(?!\s*\d+\b)/i,                                         'triple-numbers'],
  [/\btetra\b(?!\s*\d+\b)/i,                                          'tetra-numbers'],
  [/\bpenta\b(?!\s*\d+\b)/i,                                          'penta-numbers'],
  [/\bhexa\b(?!\s*\d+\b)/i,                                           'hexa-numbers'],
  [/\bsepta\b(?!\s*\d+\b)/i,                                          'septa-numbers'],
  [/\bocta\b(?!\s*\d+\b)/i,                                           'octa-numbers'],
  [/\b108\b/,                                                         '108-numbers'],
  [/\b786\s*(?:number|chahiye|wala|type)?\b/i,                       '786-numbers'],
  [/\bunique\b/i,                                                     'unique-numbers'],
];

function extractCategory(q, consumed) {
  // We will handle the 786 special case inside the loop
  for (const [rx, cat] of CATEGORY_PATTERNS) {
    const m = q.match(rx);
    if (m) {
      // Special case: "786 ending" or "786 starting"
      if (cat === '786-numbers' && (/\b786\b/i.test(q) && (/\bending\b|\bend\b|\bends?\s*with\b/i.test(q) || /\bstart/i.test(q)))) {
        continue; // Skip 786 category, let it be caught by startsWith/endsWith
      }
      
      // Consume the digits if the category is based on a specific number (786, 108)
      const catNumMatch = cat.match(/^(\d+)-numbers/);
      if (catNumMatch && !consumed.includes(catNumMatch[1])) {
        consumed.push(catNumMatch[1]);
      }
      return cat;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. STARTS WITH / ENDS WITH (digits OR pattern keywords)
// ─────────────────────────────────────────────────────────────────────────────
function extractPositional(q, consumed) {
  const out = {};

  // ── endsWith ──────────────────────────────────────────────────────────────
  const endDigitRx = [
    // Examples: "ending 987", "ends with 987", "last 987", "at end 987"
    /(?:end(?:ing|s)?\s*(?:with|in)?|last|at\s*end|aakhir(?:\s*mein)?|khatam(?:\s*mein)?)\s*(\d{1,10})/i,
    // Examples: "987 ending", "987 ends", "987 last", "987 at end"
    /(\d{1,10})\s*(?:ending|end\b|at\s*end\b|se\s*khatam|aakhir)/i,
  ];
  for (const rx of endDigitRx) {
    const m = q.match(rx);
    if (m) { out.endsWith = m[1]; consumed.push(m[1]); break; }
  }

  // "double ending", "ending triple", "penta end"
  if (!out.endsWith) {
    const epRx = /(?:ending|ends?\s*with|last|end\b)\s*(double|triple|tetra|penta|hexa|septa|octa|mirror|semi[\s-]?mirror|counting|doubling|abc[\s_-]?abc(?:[\s_-]?abc)?|ab[\s_-]?ab(?:[\s_-]?ab)?|aaa[\s_-]?bbb|ab[\s_-]?ab[\s_-]?xy[\s_-]?xy)/i;
    const pe2Rx = /(double|triple|tetra|penta|hexa|septa|octa|mirror|counting|doubling)\s*(?:ending|end\b|wala\s*end)/i;
    const m = q.match(epRx) || q.match(pe2Rx);
    if (m) {
      const kw = matchPatternKeyword(m[1]);
      if (kw) out.endsWith = kw;
    }
  }

  // ── startsWith ────────────────────────────────────────────────────────────
  const startDigitRx = [
    /(?:start(?:ing|s)?\s*(?:with)?|begins?\s*with|first|shuru(?:\s*mein)?|starting\s*from)\s*(\d{1,10})/i,
    /(\d{1,10})\s*(?:starting|start\b|se\s*shuru)/i,
  ];
  for (const rx of startDigitRx) {
    const m = q.match(rx);
    if (m) { out.startsWith = m[1]; consumed.push(m[1]); break; }
  }

  if (!out.startsWith) {
    const spRx = /(?:start(?:ing|s)?\s*(?:with)?|first|begins?\s*with)\s*(double|triple|tetra|penta|hexa|septa|octa|mirror|counting|doubling|abc[\s_-]?abc(?:[\s_-]?abc)?|ab[\s_-]?ab(?:[\s_-]?ab)?)/i;
    const sp2Rx = /(double|triple|tetra|penta|hexa|septa|octa|mirror|counting|doubling)\s*(?:starting|start\b|wala\s*start)/i;
    const m = q.match(spRx) || q.match(sp2Rx);
    if (m) {
      const kw = matchPatternKeyword(m[1]);
      if (kw) out.startsWith = kw;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ANYWHERE (contains)
// ─────────────────────────────────────────────────────────────────────────────
function extractAnywhere(q, consumed) {
  // "req 555", "containing 555", "has 555", "555 hona chahiye", "555 chahiye"
  const rxList = [
    /(?:req(?:uire)?d?\s+|request(?:ing)?\s*)(\d{2,10})/i,
    /(?:contain(?:ing|s)?|having|has|with)\s+(\d{2,10})/i,
    /(\d{2,10})\s*(?:hona\s*chahiye|chahiye|wale?\b|type\b)/i,
    /(?:mujhe|muje|mere?\s*liye)\s*(\d{2,10})/i,
  ];

  for (const rx of rxList) {
    const m = q.match(rx);
    if (m && !consumed.includes(m[1])) {
      consumed.push(m[1]);
      return m[1];
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MUST CONTAIN / NOT CONTAIN
// ─────────────────────────────────────────────────────────────────────────────
function extractMustNotContain(q, consumed) {
  const out = {};

  // mustContain: "must have 99", "should contain 9", "99 bhi hona chahiye", "and 99 also"
  const mustRx = [
    /(?:must\s*(?:have|contain)|should\s*(?:have|contain)|also\s*have|and\s*also)\s*(\d{1,5})/i,
    /(\d{1,5})\s*(?:bhi\s*(?:hona\s*)?chahiye|bhi\s*hona|bhi\s*ho)/i,
    /(?:aur|and)\s*(\d{1,5})\s*(?:bhi|also)/i,
  ];
  for (const rx of mustRx) {
    const m = q.match(rx);
    if (m && !consumed.includes(m[1])) {
      out.mustContain = m[1];
      consumed.push(m[1]);
      break;
    }
  }

  // notContain: "avoid 2480", "no 0 and 2", "without digit 4", "not contain 248"
  const notMatches = [
    ...q.matchAll(/(?:avoid|exclude|not\s*contain|don't\s*want|na\s*ho|nahi\s*chahiye|nai\s*chahiye|without\s*(?:digit\s*)?)\s*:?\s*(\d{1,5})/gi),
  ];
  const notVals = notMatches
    .map(m => m[1])
    .filter(v => !consumed.includes(v));
  if (notVals.length) {
    out.notContain = notVals.join(',');
    notVals.forEach(v => consumed.push(v));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DIGIT FREQUENCY ("99 two times", "double 9", "triple nines", "at least 3 nines")
// ─────────────────────────────────────────────────────────────────────────────
function extractDigitFrequency(q, consumed) {
  const out = {};

  // Pattern F: EXACTLY or MAX modifiers
  // "max 3 times 5", "exactly 2 times 9", "5 max 2 baar", "9 sirf 3 baar", "5 maximum 2 times"
  const pExact = /(?:exactly|sirf|only)\s*(two|three|four|five|once|twice|thrice|1|2|3|4|5|6|7|8|9|do|teen|char|paanch)\s*(?:times?|baar|bar)\s*(\d{1,2})/i;
  let m = q.match(pExact);
  if (m) {
    out.digitFreq1Digit = m[2];
    out.digitFreq1Count = wordToNum(m[1]);
    out.digitFreq1MaxCount = wordToNum(m[1]);
    consumed.push(m[2]);
    return out;
  }
  
  const pExact2 = /(\d{1,2})\s*(?:exactly|sirf|only)\s*(two|three|four|five|once|twice|thrice|1|2|3|4|5|6|7|8|9|do|teen|char|paanch)\s*(?:times?|baar|bar)/i;
  m = q.match(pExact2);
  if (m) {
    out.digitFreq1Digit = m[1];
    out.digitFreq1Count = wordToNum(m[2]);
    out.digitFreq1MaxCount = wordToNum(m[2]);
    consumed.push(m[1]);
    return out;
  }

  const pMax = /(?:maximum|max|at\s*most|zyada\s*se\s*zyada)\s*(two|three|four|five|once|twice|thrice|1|2|3|4|5|6|7|8|9|do|teen|char|paanch)\s*(?:times?|baar|bar)\s*(\d{1,2})/i;
  m = q.match(pMax);
  if (m) {
    out.digitFreq1Digit = m[2];
    out.digitFreq1Count = 1;
    out.digitFreq1MaxCount = wordToNum(m[1]);
    consumed.push(m[2]);
    return out;
  }

  const pMax2 = /(\d{1,2})\s*(?:maximum|max|at\s*most|zyada\s*se\s*zyada)\s*(two|three|four|five|once|twice|thrice|1|2|3|4|5|6|7|8|9|do|teen|char|paanch)\s*(?:times?|baar|bar)/i;
  m = q.match(pMax2);
  if (m) {
    out.digitFreq1Digit = m[1];
    out.digitFreq1Count = 1;
    out.digitFreq1MaxCount = wordToNum(m[2]);
    consumed.push(m[1]);
    return out;
  }

  // Pattern A: "<digit> <count> times" / "<digit> <count> baar"
  // e.g. "99 two times", "7 3 times", "9 thrice", "9 do baar"
  const pA = /(\d{1,2})\s+(two|three|four|five|once|twice|thrice|2|3|4|5|do|teen|char|paanch)\s*(?:times?|baar|bar)/i;
  m = q.match(pA);
  if (m) {
    out.digitFreq1Digit = m[1];
    out.digitFreq1Count = wordToNum(m[2]);
    consumed.push(m[1]);
    return out;
  }

  // Pattern B: "<count> times <digit>"
  // e.g. "three times 9"
  const pB = /(two|three|four|five|twice|thrice|2|3|4|5)\s*times?\s*(\d{1,2})/i;
  m = q.match(pB);
  if (m) {
    out.digitFreq1Digit = m[2];
    out.digitFreq1Count = wordToNum(m[1]);
    consumed.push(m[2]);
    return out;
  }

  // Pattern C: "double/triple/quad/penta <digit>" — explicit prefix
  const pC = /\b(double|triple|quad(?:ruple)?|tetra|penta|hexa|septa|octa|four\s*times?)\s*(\d{1,2})\b/i;
  m = q.match(pC);
  if (m) {
    const countMap = { double: 2, triple: 3, quadruple: 4, quad: 4, tetra: 4, penta: 5, hexa: 6, septa: 7, octa: 8 };
    const cWord = m[1].toLowerCase().replace(/\s+four\s+times?/, '');
    out.digitFreq1Digit = m[2];
    out.digitFreq1Count = countMap[cWord] ?? 4;
    consumed.push(m[2]);
    return out;
  }

  // Pattern D: "<digit> word <count> word" — e.g. "digit 9 at least three times"
  const pD = /(?:digit\s*)?(\d{1,2})\s*(?:at\s*least\s*)?(?:minimum\s*)?(two|three|four|five|2|3|4|5)\s*(?:times?|baar)/i;
  m = q.match(pD);
  if (m && !consumed.includes(m[1])) {
    out.digitFreq1Digit = m[1];
    out.digitFreq1Count = wordToNum(m[2]);
    consumed.push(m[1]);
    return out;
  }

  // Pattern E: word-digit — "three nines", "four sevens", "two zeros"
  const pE = /\b(two|three|four|five|2|3|4|5)\s+(zero(?:e?s)?|one|two|three|four|five|six|seven|eight|nine|nines?|zeros?|eights?|sevens?)/i;
  m = q.match(pE);
  if (m) {
    const count = wordToNum(m[1]);
    const digit = wordToDigit(m[2]);
    if (count && digit) {
      out.digitFreq1Digit = digit;
      out.digitFreq1Count = count;
    }
    return out;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MOST CONTAIN ("mostly 9", "maximum nines", "9 appears most")
// ─────────────────────────────────────────────────────────────────────────────
function extractMostContain(q) {
  const out = {};

  // "mostly 9", "maximum 9", "9 sabse zyada", "9 most", "mainly 9"
  const pA = /(?:mostly|mainly|maximum|max|predominantly|sabse\s*zyada|zyada(?:tar)?|jyada(?:tar)?)\s*(\d{1,2})(?!\s*\d*\s*(?:times?|baar|bar))/i;
  let m = q.match(pA);
  if (m) { out.mostContainDigit = m[1]; }

  const pA2 = /(\d{1,2})\s*(?:sabse\s*zyada|zyada(?:tar)?|jyada(?:tar)?|mostly|mainly|maximum)(?!\s*\d*\s*(?:times?|baar|bar))/i;
  if (!out.mostContainDigit) {
    m = q.match(pA2);
    if (m) out.mostContainDigit = m[1];
  }

  // Optional count: "mostly 9 at least 4 times"
  if (out.mostContainDigit) {
    const pCount = /(?:at\s*least|minimum|min)\s*(\d+)\s*times?/i;
    m = q.match(pCount);
    if (m) out.mostContainCount = parseInt(m[1], 10);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. "N digits TOGETHER" → anywhere:"0000"
// ─────────────────────────────────────────────────────────────────────────────
function extractRepeatedTogether(q) {
  // Must have explicit "together/consecutive/saath" to distinguish from frequency
  // "four zeros together" → anywhere:"0000"
  // "three nines together" → anywhere:"999"
  const rx = /\b(\w+)\s+(zero(?:e?s)?|one?s?|two|three|four|five|six|seven|eight|nine?s?|\d)\s*(?:together|saath(?:\s*mein)?|consecutive(?:ly)?|lagaatar)/i;
  const m = q.match(rx);
  if (!m) return {};
  const count = wordToNum(m[1]);
  // Handle "nines" → "9", "zeros" → "0" etc via wordToDigit which strips plurals
  const rawWord = m[2].toLowerCase();
  const digit = wordToDigit(rawWord) ?? (rawWord === 'nines' ? '9' : rawWord === 'zeros' ? '0' : rawWord === 'eights' ? '8' : rawWord === 'sevens' ? '7' : rawWord === 'sixes' ? '6' : rawWord === 'fives' ? '5' : rawWord === 'fours' ? '4' : rawWord === 'threes' ? '3' : rawWord === 'twos' ? '2' : rawWord === 'ones' ? '1' : null);
  if (!count || digit === null) return {};
  return { anywhere: digit.repeat(count) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. PRICE
// ─────────────────────────────────────────────────────────────────────────────
const PRICE_UNITS = {
  k: 1_000, thousand: 1_000, hajar: 1_000, hazar: 1_000,
  l: 1_00_000, lakh: 1_00_000, lac: 1_00_000,
};

function parsePriceToken(token) {
  if (!token) return null;
  const m = token.match(/^(\d+(?:\.\d+)?)\s*(k|thousand|hajar|hazar|l|lakh|lac)?$/i);
  if (!m) return null;
  const base = parseFloat(m[1]);
  const unit = m[2] ? PRICE_UNITS[m[2].toLowerCase()] : 1;
  return Math.round(base * unit);
}

function extractPrice(q, consumed) {
  const out = {};
  const qLower = q.toLowerCase();

  // Range: "budget 1000 to 5000", "1k to 5k", "1000-5000", "1 lakh se 5 lakh"
  const rangeRx = /(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)\s*(?:to|se|-|–)\s*(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)/i;
  if (/budget|price|range|rs\.?|₹|cost/i.test(q) || /\d\s*(?:to|se|-)\s*\d/i.test(q)) {
    const m = q.match(rangeRx);
    if (m) {
      const min = parsePriceToken(m[1].trim());
      const max = parsePriceToken(m[2].trim());
      if (min && max && min < max) {
        out.minPrice = min;
        out.maxPrice = max;
        consumed.push(m[1].replace(/\s+/g, ''), m[2].replace(/\s+/g, ''));
        return out;
      }
    }
  }

  // Max: "under 5000", "below 2k", "max 10000", "upto 1 lakh", "5000 se kam"
  const maxRx = /(?:under|below|max(?:imum)?|upto|up\s*to|se\s*kam|ke\s*neeche|ke\s*andar|tak)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)(?!\s*\d*\s*(?:times?|baar|bar))/i;
  const maxRx2 = /(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)\s*(?:se\s*(?:kam|neeche|under)|ke\s*neeche)/i;
  let m = q.match(maxRx) || q.match(maxRx2);
  if (m) {
    const val = parsePriceToken(m[1].trim());
    if (val) { out.maxPrice = val; consumed.push(m[1].trim()); }
  }

  // Min: "above 5000", "over 1k", "minimum 2000", "5000 se upar"
  const minRx = /(?:above|over|min(?:imum)?|se\s*zyada|se\s*upar|se\s*aage)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)/i;
  const minRx2 = /(\d+(?:\.\d+)?(?:\s*(?:k|thousand|hajar|hazar|l|lakh|lac))?)\s*(?:se\s*(?:zyada|upar|aage))/i;
  m = q.match(minRx) || q.match(minRx2);
  if (m) {
    const val = parsePriceToken(m[1].trim());
    if (val) { out.minPrice = val; consumed.push(m[1].trim()); }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SUM (scoreSum vs literSum)
// ─────────────────────────────────────────────────────────────────────────────
function extractSum(q) {
  const out = {};

  // literSum: explicit "digit sum", "sum of digits", "exact sum" — can be any number
  const literRx = /(?:digit\s*sum|sum\s*of\s*(?:all\s*)?digits?|exact\s*sum)\s*(?:is\s*|=\s*|ho\s*)?(\d{1,3})/i;
  let m = q.match(literRx);
  if (m) {
    out.literSum = parseInt(m[1], 10);
    return out; // literSum is more specific, return early
  }

  // scoreSum (numerology, 1-9): "total 5", "sum 5", "ank 5", "numerology 5", "moolank 5"
  const scoreRx = /(?:total|sum|ank|moolank|numerology|numerology\s*total|life\s*path)\s*:?\s*(?:is\s*|=\s*|ho\s*)?(\d{1,2})/i;
  m = q.match(scoreRx);
  if (m) {
    const val = parseInt(m[1], 10);
    if (val >= 1 && val <= 9) out.scoreSum = val;
    else out.literSum = val; // if > 9, treat as literSum
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. EXACT DIGIT PLACEMENT (10-char mask, ? for wildcards)
// ─────────────────────────────────────────────────────────────────────────────
function extractExactPlacement(q) {
  // Direct 10-char mask: user types "98????????" or "98?????00?"
  const maskRx = /\b([0-9?]{10})\b/;
  let m = q.match(maskRx);
  if (m) return { exactDigitPlacement: m[1] };

  // "98 at start and 00 at end" → "98????????00" but we need 10 chars total
  // This is complex — build partial mask
  const startM = q.match(/(?:start(?:ing)?|first)\s*(\d{1,8})/i);
  const endM = q.match(/(?:end(?:ing)?|last)\s*(\d{1,8})/i);
  if (startM && endM) {
    const s = startM[1];
    const e = endM[1];
    if (s.length + e.length <= 10) {
      const mid = 10 - s.length - e.length;
      return { exactDigitPlacement: s + '?'.repeat(mid) + e };
    }
  }

  // "9 at position 3" (1-indexed) → "??9???????"
  const posRx = /(\d)\s*at\s*(?:position|pos)\s*(\d)/i;
  m = q.match(posRx);
  if (m) {
    const digit = m[1];
    const pos = parseInt(m[2], 10); // 1-indexed
    if (pos >= 1 && pos <= 10) {
      const arr = '??????????'.split('');
      arr[pos - 1] = digit;
      return { exactDigitPlacement: arr.join('') };
    }
  }

  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. PURE-DIGIT "ANYWHERE" FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
// "req 555", "555", "9999" standalone — map to anywhere
function extractPureAnywhere(q, consumed) {
  // Only fire if query has no positional clues — a 2-10 digit number with req/want
  if (/\breq(?:uire)?\s+(\d{2,10})\b/i.test(q)) {
    const m = q.match(/\breq(?:uire)?\s+(\d{2,10})\b/i);
    if (m && !consumed.includes(m[1])) return m[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER EXTRACTOR
// ─────────────────────────────────────────────────────────────────────────────
function extractFiltersFromQuery(rawQuery) {
  let q = rawQuery || '';

  // FIREWALL: Zero-Relevance Check (Save AI Tokens)
  // If the query contains NO digits and NO known pattern/category keywords,
  // it is entirely irrelevant (e.g. "hi", "i need a sofa").
  // We return confident: true with empty object so AI is completely skipped.
  const hasDigits = /\d/.test(q);
  const hasPatternKeywords = PATTERN_KEYWORDS.some(([rx]) => rx.test(q));
  
  // Intent keywords that signify a genuine search even without digits or explicit patterns
  // Includes spelled-out numbers (one, two) and domain terms (numerology, moolank)
  const intentKeywords = /\b(numerology|moolank|baba|lucky|astrology|total|sum|avoid|req|chahiye|need|want|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
  const hasIntent = intentKeywords.test(q);

  if (!hasDigits && !hasPatternKeywords && !hasIntent) {
    return {
      extracted: {},
      confident: true, // Bypass AI
      unconsumedDigits: []
    };
  }

  q = q.trim();
  const consumed = []; // digit strings "claimed" by an extractor

  // Run all extractors
  const category  = extractCategory(q, consumed);
  const positional = extractPositional(q, consumed);
  const price     = extractPrice(q, consumed);
  // "together" must run BEFORE frequency — "three nines together" → anywhere, not digitFreq
  const together  = extractRepeatedTogether(q);
  const freq      = together.anywhere ? {} : extractDigitFrequency(q, consumed);
  const most      = extractMostContain(q);
  const sum       = extractSum(q);
  const placement = extractExactPlacement(q);
  const mustNot   = extractMustNotContain(q, consumed);

  // anywhere: dedicated extractors first, then positional fallback
  let anywhere = null;
  if (!positional.anywhere) {
    anywhere = extractAnywhere(q, consumed) || extractPureAnywhere(q, consumed);
  }

  // Assemble — only include non-null/non-empty fields
  const extracted = {};
  if (category)                extracted.category        = category;
  if (positional.startsWith)   extracted.startsWith      = positional.startsWith;
  if (positional.endsWith)     extracted.endsWith        = positional.endsWith;
  if (positional.anywhere)     extracted.anywhere        = positional.anywhere;
  else if (anywhere)           extracted.anywhere        = anywhere;
  if (mustNot.mustContain)     extracted.mustContain     = mustNot.mustContain;
  if (mustNot.notContain)      extracted.notContain      = mustNot.notContain;
  if (sum.literSum  != null)   extracted.literSum        = sum.literSum;
  if (sum.scoreSum  != null)   extracted.scoreSum        = sum.scoreSum;
  if (price.minPrice != null)  extracted.minPrice        = price.minPrice;
  if (price.maxPrice != null)  extracted.maxPrice        = price.maxPrice;
  if (together.anywhere)       extracted.anywhere        = together.anywhere; // overrides if more specific
  if (placement.exactDigitPlacement) extracted.exactDigitPlacement = placement.exactDigitPlacement;
  if (most.mostContainDigit)   extracted.mostContainDigit  = most.mostContainDigit;
  if (most.mostContainCount)   extracted.mostContainCount  = most.mostContainCount;
  if (freq.digitFreq1Digit)    extracted.digitFreq1Digit   = freq.digitFreq1Digit;
  if (freq.digitFreq1Count)    extracted.digitFreq1Count   = freq.digitFreq1Count;
  if (freq.digitFreq1MaxCount) extracted.digitFreq1MaxCount= freq.digitFreq1MaxCount;

  // ── Confidence decision & Multi-Constraint Merging ───────────────────────
  const allDigitGroups = [...q.matchAll(/\d{2,10}/g)].map(m => m[0]);
  let unconsumedDigits = allDigitGroups.filter(d => !consumed.includes(d));

  // If there's an exact 10 digit number in unconsumed, user just wants this number
  const tenDigit = unconsumedDigits.find(d => d.length === 10);
  if (tenDigit) {
    extracted.anywhere = tenDigit;
    unconsumedDigits = unconsumedDigits.filter(d => d !== tenDigit);
  }

  // If there are still unconsumed numbers (e.g. "9999 786" or "0000 9999")
  // Sweeper Logic: Convert any unconsumed digits into 'anywhere' or 'mustContain'
  // Fix Issue 3: Deduplicate unconsumed digits to prevent {"anywhere":"9999","mustContain":"9999"}
  unconsumedDigits = [...new Set(unconsumedDigits)].filter(d => 
    d !== extracted.anywhere && 
    d !== extracted.exactDigitPlacement && 
    d !== extracted.startsWith && 
    d !== extracted.endsWith && 
    !(extracted.mustContain && extracted.mustContain.includes(d))
  );

  if (unconsumedDigits.length > 0) {
    let mustArr = extracted.mustContain ? extracted.mustContain.split(',') : [];
    
    unconsumedDigits.forEach(d => {
      if (!extracted.anywhere && d.length >= 2) {
        extracted.anywhere = d; // Claim first unconsumed as anywhere
      } else if (d.length <= 5) { // mustContain max length is 5
        if (!mustArr.includes(d)) mustArr.push(d);
      }
    });

    if (mustArr.length > 0) {
      extracted.mustContain = mustArr.join(',');
    }
    unconsumedDigits = []; // Everything is now consumed!
  }

  const hasExtracted = Object.keys(extracted).length > 0;
  
  // Bug 3 Fix: If a domain pattern word is in the query but was ignored, drop confidence!
  let unconsumedPattern = false;
  
  // 1. Check PATTERN_KEYWORDS
  for (const [rx, kw] of PATTERN_KEYWORDS) {
    if (rx.test(q)) {
      const isCaptured = 
        (extracted.category && extracted.category.replace(/-/g, '_').toUpperCase().includes(kw)) ||
        (kw === 'DOUBLE' && extracted.category === 'doubling-numbers') ||
        (kw === 'START' && extracted.startsWith !== undefined) ||
        (kw === 'END' && extracted.endsWith !== undefined) ||
        (['DOUBLE','TRIPLE','TETRA','PENTA','HEXA','SEPTA','OCTA'].includes(kw) && extracted.digitFreq1Count !== undefined);
      
      if (!isCaptured) {
        unconsumedPattern = true;
        break;
      }
    }
  }

  // 2. Check CATEGORY_PATTERNS
  if (!unconsumedPattern) {
    for (const [rx, cat] of CATEGORY_PATTERNS) {
      if (rx.test(q)) {
        const catBase = cat.replace('-numbers', '');
        const isCaptured = 
          (extracted.category && extracted.category.includes(catBase)) ||
          (extracted.startsWith && extracted.startsWith.replace(/_/g, '-').toLowerCase().includes(catBase)) ||
          (extracted.endsWith && extracted.endsWith.replace(/_/g, '-').toLowerCase().includes(catBase)) ||
          (catBase === '786' && Object.values(extracted).some(v => String(v).includes('786'))) ||
          (catBase === '108' && Object.values(extracted).some(v => String(v).includes('108'))) ||
          (catBase === 'without-248' && extracted.notContain) ||
          (extracted.category === cat);
        
        if (!isCaptured) {
          unconsumedPattern = true;
          break;
        }
      }
    }
  }

  // Confident only if we successfully parsed something, no numbers left, and no domain words left ignored
  const confident = hasExtracted && unconsumedDigits.length === 0 && !unconsumedPattern;

  return { extracted, confident, unconsumedDigits };
}

module.exports = { extractFiltersFromQuery };