import assert from 'assert';
import { 
  normalizeSearchQuery, 
  extractFallbackSearchJSON, 
  sanitizeHallucinatedNumbers,
  stripPhantomQuestions 
} from '../api/utils/aiAgent.js';
import { fetchNumbers } from '../api/utils/searchApi.js';

console.log("====================================================");
console.log("🧪 TESTING 0018 / NON-6-9 PREFIX & CONFIRMATION FIXES");
console.log("====================================================\n");

// 1. startsWith conversion when digits don't start with 6, 7, 8, 9
console.log("--- 1. normalizeSearchQuery non-[6-9] startsWith conversion ---");
const norm0018 = normalizeSearchQuery({ startsWith: '0018', maxPrice: 15000 });
assert.strictEqual(norm0018.startsWith, undefined, "startsWith 0018 should be removed");
assert.strictEqual(norm0018.anywhere, '0018', "startsWith 0018 should be converted to anywhere");
assert.strictEqual(norm0018.maxPrice, 15000, "maxPrice should be preserved");
console.log("✅ [PASS] '0018' converted to anywhere: '0018'");

const norm007 = normalizeSearchQuery({ startsWith: '007' });
assert.strictEqual(norm007.startsWith, undefined);
assert.strictEqual(norm007.anywhere, '007');
console.log("✅ [PASS] '007' converted to anywhere: '007'");

const norm98 = normalizeSearchQuery({ startsWith: '98' });
assert.strictEqual(norm98.startsWith, '98');
assert.strictEqual(norm98.anywhere, undefined);
console.log("✅ [PASS] '98' preserved as startsWith: '98'");

// 2. Fallback search parser for inquiries like "Price of 0018..?"
console.log("\n--- 2. extractFallbackSearchJSON inquiries ---");
const queryPrice0018 = extractFallbackSearchJSON("Price of 0018..?");
assert.ok(queryPrice0018, "Should extract query for Price of 0018..?");
assert.strictEqual(queryPrice0018.anywhere, '0018', "Should extract anywhere: '0018'");
console.log("✅ [PASS] 'Price of 0018..?' parsed as anywhere: '0018'");

const query15k = extractFallbackSearchJSON("15000rs hai", { anywhere: '0018' });
assert.ok(query15k, "Should extract 15000 budget from '15000rs hai'");
assert.strictEqual(query15k.maxPrice, 15000, "maxPrice should be 15000");
console.log("✅ [PASS] '15000rs hai' parsed as maxPrice: 15000");

// 3. Affirmation / Continuation messages
console.log("\n--- 3. Confirmation / Affirmation re-activation ---");
const activeFilters = { anywhere: '0018', maxPrice: 15000 };
const queryOk = extractFallbackSearchJSON("Ok", activeFilters);
assert.deepStrictEqual(queryOk, activeFilters, "Should return activeFilters for 'Ok'");
console.log("✅ [PASS] 'Ok' re-activated activeFilters");

const queryYes = extractFallbackSearchJSON("yes", activeFilters);
assert.deepStrictEqual(queryYes, activeFilters, "Should return activeFilters for 'yes'");
console.log("✅ [PASS] 'yes' re-activated activeFilters");

// 4. Hanging header & phantom question stripping
console.log("\n--- 4. Hanging headers & phantom question cleanup ---");
const textWithHangingHeader = `Here are some VIP numbers starting with **0018** that fall within your budget of ₹15,000:

• 0018000001
• 0018000002
• 0018000003

Which of these patterns catches your eye? Would you like to reserve one of these for you? 😊`;

const sanitized = sanitizeHallucinatedNumbers(textWithHangingHeader, []);
const cleaned = stripPhantomQuestions(sanitized);
assert.ok(!cleaned.includes("0018000001"), "Hallucinated number must be stripped");
assert.ok(!cleaned.includes("Here are some VIP numbers"), "Hanging header must be stripped when bullets are gone");
assert.ok(!cleaned.includes("Would you like to reserve"), "Phantom closing question must be stripped");
console.log("✅ [PASS] Successfully eliminated hanging headers, fake numbers, and phantom questions!");

// 5. Live fetch check
console.log("\n--- 5. Live query verification ---");
const searchRes = await fetchNumbers(normalizeSearchQuery({ startsWith: '0018', maxPrice: 15000 }), 1);
assert.ok(searchRes.totalCount > 0, "Should find numbers for 0018 under 15000");
assert.ok(searchRes.products.length > 0, "Should return product list");
console.log(`✅ [PASS] Live search found ${searchRes.totalCount} real numbers for 0018 (e.g. ${searchRes.products[0].productMobileNumber})`);

console.log("\n====================================================");
console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
console.log("====================================================");
