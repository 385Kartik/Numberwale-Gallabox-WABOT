import { 
  stripSearchJSON, 
  extractSearchJSON, 
  normalizeSearchQuery, 
  validateProductsAgainstConstraints 
} from '../api/utils/aiAgent.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

console.log('====================================================');
console.log('TESTING SEARCH JSON SANITIZATION & NORMALIZATION');
console.log('====================================================\n');

// ── TEST 1: stripSearchJSON Leaked JSON Stripping ──
console.log('--- TEST 1: stripSearchJSON Leaked JSON Stripping ---');

const nageswaraLeakedText = `Thank you for sharing your budget, Nageswara! I will now search for VIP numbers under ₹50,000 that meet all your specified criteria.  
 
Just a moment, please! 😊 
 
,"avoidPairs":["18","81","48","84","85","58","67","76","79","97","44","27","13","12","36","14","41","16","61","23","32","24","42","35","53","45","54","72","27","26","62"],"sixthDigit":{"$nin":[0,1,3,8]},"secondDigit":{"$nin":[4,7]},"endWith":{"$ne":0},"repeatCount":1}`;

const cleanedNageswara = stripSearchJSON(nageswaraLeakedText);
assert(!cleanedNageswara.includes('avoidPairs'), 'Must not contain avoidPairs');
assert(!cleanedNageswara.includes('sixthDigit'), 'Must not contain sixthDigit');
assert(!cleanedNageswara.includes('$nin'), 'Must not contain $nin');
assert(!cleanedNageswara.includes('{'), 'Must not contain {');
assert(!cleanedNageswara.includes('}'), 'Must not contain }');
assert(cleanedNageswara.includes('Thank you for sharing your budget, Nageswara!'), 'Preserves conversational text');
assert(cleanedNageswara.includes('Just a moment, please! 😊'), 'Preserves polite follow-up');

const textWithCodeFence = `Here are some options for you:\n\`\`\`json\n{"category":"mirror-numbers","maxPrice":30000}\n\`\`\`\nLet me know which one you like!`;
const cleanedCodeFence = stripSearchJSON(textWithCodeFence);
assert(!cleanedCodeFence.includes('```'), 'Strips code fences');
assert(!cleanedCodeFence.includes('mirror-numbers'), 'Strips JSON from code fences');
assert(cleanedCodeFence.includes('Here are some options for you:'), 'Keeps intro');
assert(cleanedCodeFence.includes('Let me know which one you like!'), 'Keeps outro');

const textWithSearchJSON = `I found some great numbers for you! 😊\n\nSEARCH_JSON:{"startsWith":"9","endsWith":"5","maxPrice":50000}\n\nWhich pattern do you prefer?`;
const cleanedSearchJSON = stripSearchJSON(textWithSearchJSON);
assert(!cleanedSearchJSON.includes('SEARCH_JSON'), 'Strips SEARCH_JSON marker');
assert(!cleanedSearchJSON.includes('maxPrice'), 'Strips JSON content');
assert(cleanedSearchJSON.includes('I found some great numbers for you! 😊'), 'Keeps conversation');


// ── TEST 2: extractSearchJSON & normalizeSearchQuery ──
console.log('\n--- TEST 2: extractSearchJSON & normalizeSearchQuery ---');

// Standard
const normalInput = `SEARCH_JSON:{"startsWith":"9","endsWith":"5","maxPrice":50000}`;
const parsedNormal = extractSearchJSON(normalInput);
assert(parsedNormal?.startsWith === '9', 'Extracts startsWith');
assert(parsedNormal?.endsWith === '5', 'Extracts endsWith');
assert(parsedNormal?.maxPrice === 50000, 'Extracts maxPrice');

// Split broken input with avoidPairs and Mongo operators
const brokenInput = `SEARCH_JSON:{"maxPrice":50000},"avoidPairs":["18","81","48"],"sixthDigit":{"$nin":[0,1,3,8]},"secondDigit":{"$nin":[4,7]},"endWith":"5","repeatCount":1}`;
const parsedBroken = extractSearchJSON(brokenInput);
assert(parsedBroken !== undefined, 'Successfully parses broken split SEARCH_JSON');
assert(parsedBroken?.maxPrice === 50000, 'Extracts maxPrice from broken input');
assert(parsedBroken?.endsWith === '5', 'Maps endWith to endsWith');
assert(parsedBroken?.notContain !== undefined, 'Maps avoidPairs and $nin to notContain');
assert(parsedBroken?.notContain.includes('18'), 'Contains 18 in notContain');
assert(parsedBroken?.notContain.includes('81'), 'Contains 81 in notContain');
assert(parsedBroken?.notContain.includes('48'), 'Contains 48 in notContain');
assert(parsedBroken?.sixthDigit === undefined, 'Strips unsupported sixthDigit key');
assert(parsedBroken?.repeatCount === undefined, 'Strips unsupported repeatCount key');

// Raw normalizeSearchQuery test
const rawNormTest = normalizeSearchQuery({
  startWith: "98",
  endWith: "007",
  avoidPairs: ["18", "81"],
  notInclude: "4,7",
  sixthDigit: { $nin: ["0", "1"] },
  maxPrice: "35000",
  category: "mirror-numbers"
});
assert(rawNormTest.startsWith === '98', 'Normalizes startWith to startsWith');
assert(rawNormTest.endsWith === '007', 'Normalizes endWith to endsWith');
assert(rawNormTest.maxPrice === 35000, 'Normalizes maxPrice to integer');
assert(rawNormTest.category === 'mirror-numbers', 'Preserves valid category');
assert(rawNormTest.notContain.includes('18'), 'Includes 18 in notContain');
assert(rawNormTest.notContain.includes('81'), 'Includes 81 in notContain');
assert(rawNormTest.notContain.includes('4'), 'Includes 4 in notContain');
assert(rawNormTest.notContain.includes('7'), 'Includes 7 in notContain');
assert(rawNormTest.notContain.includes('0'), 'Includes 0 from $nin in notContain');
assert(rawNormTest.notContain.includes('1'), 'Includes 1 from $nin in notContain');


// ── TEST 3: validateProductsAgainstConstraints ──
console.log('\n--- TEST 3: validateProductsAgainstConstraints ---');

const mockProducts = [
  // Product 1: Starts with 8, ends with 8 (VIOLATES startsWith 9)
  {
    productMobileNumber: '8693074208',
    pricing: { nwFinalPrice: 1176 }
  },
  // Product 2: Starts with 8, ends with 8 (VIOLATES startsWith 9)
  {
    productMobileNumber: '8828261378',
    pricing: { nwFinalPrice: 1176 }
  },
  // Product 3: Starts with 9, ends with 5, contains pair 18 (VIOLATES notContain: 18)
  {
    productMobileNumber: '9818223355',
    pricing: { nwFinalPrice: 25000 }
  },
  // Product 4: Starts with 9, ends with 5, clean digits, price 45000 (VALID)
  {
    productMobileNumber: '9777555555',
    pricing: { nwFinalPrice: 45000 }
  },
  // Product 5: Starts with 9, ends with 5, clean digits, price 65000 (VIOLATES maxPrice 50000)
  {
    productMobileNumber: '9999955555',
    pricing: { nwFinalPrice: 65000 }
  }
];

const constraints = {
  startsWith: '9',
  endsWith: '5',
  notContain: '18,81',
  maxPrice: 50000
};

const validResults = validateProductsAgainstConstraints(mockProducts, constraints);
assert(validResults.length === 1, `Expected 1 valid product, got ${validResults.length}`);
assert(validResults[0].productMobileNumber === '9777555555', 'Correct product passed validation');

// Test that 8-starting numbers are 100% rejected when startsWith: '9'
const rejectedStarts8 = validateProductsAgainstConstraints(
  [{ productMobileNumber: '8693074208' }, { productMobileNumber: '8828261378' }],
  { startsWith: '9' }
);
assert(rejectedStarts8.length === 0, 'Numbers starting with 8 must be rejected when startsWith: 9');

// Test that 8-ending numbers are 100% rejected when endsWith: '5'
const rejectedEnds8 = validateProductsAgainstConstraints(
  [{ productMobileNumber: '9828261378' }],
  { endsWith: '5' }
);
assert(rejectedEnds8.length === 0, 'Numbers ending with 8 must be rejected when endsWith: 5');

// Test that numbers containing avoided pairs are 100% rejected
const rejectedAvoidPairs = validateProductsAgainstConstraints(
  [{ productMobileNumber: '9818223355' }, { productMobileNumber: '9881223355' }],
  { notContain: '18,81' }
);
assert(rejectedAvoidPairs.length === 0, 'Numbers containing 18 or 81 must be rejected');


// ── TEST 4: Multi-Turn State Recovery (Customer criteria recovery) ──
console.log('\n--- TEST 4: Multi-Turn History & Filter Recovery ---');

// Simulate customer asked for "starts with 9 and ends with 5" in history turn,
// and now only replies "50000" as budget.
const mockHistory = [
  { role: 'user', text: 'I want numbers starting with 9 and ending with 5' },
  { role: 'bot', text: 'Sure! What is your budget?' }
];
const currentMessage = 'under 50000';

// When extractSearchJSON parses currentMessage or fallback:
import { extractFallbackSearchJSON } from '../api/utils/aiAgent.js';

let effectiveQuery = extractFallbackSearchJSON(currentMessage);
assert(effectiveQuery.maxPrice === 50000, 'Detected budget 50000');

// Run history recovery as done in runAgent
for (let i = mockHistory.length - 1; i >= 0; i--) {
  if (mockHistory[i].role === 'user') {
    const pastFilters = extractFallbackSearchJSON(mockHistory[i].text);
    if (pastFilters) {
      if (!effectiveQuery.startsWith && pastFilters.startsWith) effectiveQuery.startsWith = pastFilters.startsWith;
      if (!effectiveQuery.endsWith && pastFilters.endsWith) effectiveQuery.endsWith = pastFilters.endsWith;
      if (!effectiveQuery.category && pastFilters.category) effectiveQuery.category = pastFilters.category;
      if (!effectiveQuery.notContain && pastFilters.notContain) effectiveQuery.notContain = pastFilters.notContain;
    }
  }
}

assert(effectiveQuery.startsWith === '9', 'Successfully recovered startsWith 9 from history');
assert(effectiveQuery.endsWith === '5', 'Successfully recovered endsWith 5 from history');
assert(effectiveQuery.maxPrice === 50000, 'Retained maxPrice 50000 from current turn');

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
