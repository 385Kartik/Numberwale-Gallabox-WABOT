import { isValidHumanName, cleanCustomerName, parseNameAndPincode, extractFallbackSearchJSON, buildSystemPrompt } from '../api/utils/aiAgent.js';
import { normalizeCategorySlug, fetchNumbers } from '../api/utils/searchApi.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE NAME & SEARCH VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 1: isValidHumanName Validation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Testing isValidHumanName ---');
  const invalidNames = [
    'Hi Found Your',
    'Total Number Six',
    'Want Nice Vip',
    'Allah Ka Shukar',
    '020202',
    'Not very costly',
    'Unknown',
    'Sir',
    'Customer',
    'Numberwale Vip',
    'Hi! I found your website',
    'Need budget 5000',
    'Call me please'
  ];

  for (const name of invalidNames) {
    assert(!isValidHumanName(name), `Correctly rejected invalid name: "${name}"`);
  }

  const validNames = [
    'Kartik',
    'Kartik Parmar',
    'Pavan Battase',
    'Tushar Mishra',
    'Rahul',
    'Priya Sharma',
    'Mohit Kumar'
  ];

  for (const name of validNames) {
    assert(isValidHumanName(name), `Correctly accepted genuine name: "${name}"`);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: cleanCustomerName
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Testing cleanCustomerName ---');
  assert(cleanCustomerName('kartik') === 'Kartik', 'Cleaned single name: kartik -> Kartik');
  assert(cleanCustomerName('kartik parmar') === 'Kartik Parmar', 'Cleaned full name: kartik parmar -> Kartik Parmar');
  assert(cleanCustomerName('pavan battase') === 'Pavan Battase', 'Cleaned full name: pavan battase -> Pavan Battase');
  assert(cleanCustomerName('Hi! I found your website. I have a question about fancy numbers!') === null, 'Rejected website greeting sentence');
  assert(cleanCustomerName('Total number six without repeat number') === null, 'Rejected query words: Total number six without repeat number');
  assert(cleanCustomerName('Want nice vip number') === null, 'Rejected query words: Want nice vip number');
  assert(cleanCustomerName('Allah ka shukar') === null, 'Rejected religious greeting: Allah ka shukar');
  assert(cleanCustomerName('020202') === null, 'Rejected digit string: 020202');

  // ─────────────────────────────────────────────────────────────
  // TEST 3: parseNameAndPincode
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Testing parseNameAndPincode ---');
  // Genuine name + pin inputs
  const p1 = parseNameAndPincode('kartik 401105');
  assert(p1?.name === 'Kartik' && p1?.pin === '401105', 'Parsed "kartik 401105"');

  const p2 = parseNameAndPincode('401105 kartik parmar');
  assert(p2?.name === 'Kartik Parmar' && p2?.pin === '401105', 'Parsed "401105 kartik parmar"');

  const p3 = parseNameAndPincode('Pavan Battase');
  assert(p3?.name === 'Pavan Battase' && p3?.pin === null, 'Parsed valid standalone name "Pavan Battase"');

  const p4 = parseNameAndPincode('401105', 'Pavan Battase');
  assert(p4?.name === 'Pavan Battase' && p4?.pin === '401105', 'Merged pin with valid knownName "Pavan Battase"');

  // Corrupted / Query inputs (MUST return null or not extract queries as names)
  const p5 = parseNameAndPincode('Hi! I found your website. I have a question about fancy numbers!');
  assert(p5 === null, 'Website button query returned null (NOT "Hi Found Your")');

  const p6 = parseNameAndPincode('Total number six without repeat number');
  assert(p6 === null, 'Query "Total number six without repeat number" returned null (NOT "Total Number Six")');

  const p7 = parseNameAndPincode('Want nice vip number');
  assert(p7 === null, 'Query "Want nice vip number" returned null');

  const p8 = parseNameAndPincode('Allah ka shukar');
  assert(p8 === null, 'Phrase "Allah ka shukar" returned null');

  const p9 = parseNameAndPincode('020202');
  assert(p9 === null, 'Pattern "020202" returned null');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Category Normalization & Backend 404 Prevention
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Testing Category Normalization ---');
  assert(normalizeCategorySlug('without-repeat-numbers') === 'unique-numbers', 'Normalized "without-repeat-numbers" -> "unique-numbers"');
  assert(normalizeCategorySlug('without repeat') === 'unique-numbers', 'Normalized "without repeat" -> "unique-numbers"');
  assert(normalizeCategorySlug('unique') === 'unique-numbers', 'Normalized "unique" -> "unique-numbers"');
  assert(normalizeCategorySlug('no-repeat-numbers') === 'unique-numbers', 'Normalized "no-repeat-numbers" -> "unique-numbers"');
  assert(normalizeCategorySlug('mirror') === 'mirror-numbers', 'Normalized "mirror" -> "mirror-numbers"');
  assert(normalizeCategorySlug('random-invalid-category') === null, 'Pruned unknown category');

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Fallback Search Extraction
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Testing extractFallbackSearchJSON ---');
  // Scenario 1 (Screenshot 2): "Total number six without repeat number"
  const f1 = extractFallbackSearchJSON('Total number six without repeat number');
  assert(f1?.category === 'unique-numbers' && f1?.scoreSum === 6, `Extracted { category: "unique-numbers", scoreSum: 6 } from "Total number six without repeat number" (Got: ${JSON.stringify(f1)})`);

  // Scenario 2 (Screenshot 2): Follow-up "Not very costly" with active { category: "unique-numbers", scoreSum: 6 }
  const f2 = extractFallbackSearchJSON('Not very costly', { category: 'unique-numbers', scoreSum: 6 });
  assert(f2?.category === 'unique-numbers' && f2?.scoreSum === 6 && f2?.sortPrice === 'lowToHigh' && f2?.maxPrice === 15000, `Merged "Not very costly" into active filters: ${JSON.stringify(f2)}`);

  // Scenario 3 (Screenshot 3): Standalone pattern "020202"
  const f3 = extractFallbackSearchJSON('020202');
  assert(f3?.anywhere === '020202' && !f3?.maxPrice, `Parsed "020202" as anywhere pattern (NOT maxPrice budget! Got: ${JSON.stringify(f3)})`);

  // Scenario 4 (Screenshot 3): Standalone pattern "020202" when customer previously had "abc-abc-numbers"
  const f4 = extractFallbackSearchJSON('020202', { category: 'abc-abc-numbers' });
  assert(f4?.anywhere === '020202' && !f4?.category && !f4?.maxPrice, `Parsed "020202" and dropped conflicting old category: ${JSON.stringify(f4)}`);

  // Standalone pattern "9999"
  const f5 = extractFallbackSearchJSON('9999');
  assert(f5?.anywhere === '9999', `Parsed "9999" as anywhere pattern: ${JSON.stringify(f5)}`);

  // Standalone pattern "007"
  const f6 = extractFallbackSearchJSON('007');
  assert(f6?.anywhere === '007', `Parsed "007" as anywhere pattern: ${JSON.stringify(f6)}`);

  // Round budget "5000" with active filters
  const f7 = extractFallbackSearchJSON('5000', { category: 'mirror-numbers' });
  assert(f7?.maxPrice === 5000, `Parsed round number "5000" with active filters as budget: ${JSON.stringify(f7)}`);

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Live API Search Execution
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 6. Testing Live API Queries via fetchNumbers ---');
  // Scenario 1 Live Search: without repeat + scoreSum 6
  const apiRes1 = await fetchNumbers({ category: 'without-repeat-numbers', scoreSum: 6 });
  assert(apiRes1.totalCount > 0 && apiRes1.products.length > 0, `Live query { category: "without-repeat-numbers", scoreSum: 6 } returned ${apiRes1.totalCount} numbers (No 404!)`);

  // Scenario 2 Live Search: anywhere "020202"
  const apiRes2 = await fetchNumbers({ anywhere: '020202' });
  assert(apiRes2.totalCount > 0 && apiRes2.products.length > 0, `Live query { anywhere: "020202" } returned ${apiRes2.totalCount} numbers!`);

  // Scenario 3 Live Search: Invalid category pruned safely without crashing
  const apiRes3 = await fetchNumbers({ category: 'invalid-hallucinated-slug' });
  assert(apiRes3.totalCount > 0 && apiRes3.products.length > 0, `Live query with invalid category pruned safely and returned ${apiRes3.totalCount} fallback numbers!`);

  // ─────────────────────────────────────────────────────────────
  // TEST 7: buildSystemPrompt Name Integrity
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 7. Testing buildSystemPrompt Greeting & Title ---');
  const promptPoisoned = buildSystemPrompt({ name: 'Hi Found Your', language: 'English' });
  const includesPoisoned = promptPoisoned.includes('Hi Found Your');
  assert(!includesPoisoned, 'buildSystemPrompt sanitized corrupted name "Hi Found Your"');

  const promptPoisoned2 = buildSystemPrompt({ name: 'Total Number Six', language: 'English' });
  const includesPoisoned2 = promptPoisoned2.includes('Total Number Six');
  assert(!includesPoisoned2, 'buildSystemPrompt sanitized corrupted name "Total Number Six"');

  const promptValid = buildSystemPrompt({ name: 'Pavan Battase', language: 'English' });
  const includesValid = promptValid.includes('Pavan Battase');
  assert(includesValid, 'buildSystemPrompt correctly addressed genuine customer "Pavan Battase"');

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed}/${total} assertions passed!`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
