import { parseNameAndPincode } from '../api/utils/aiAgent.js';
import { validateIndianPincode } from '../api/utils/pincodeValidator.js';

async function runTests() {
  console.log('=== RUNNING PINCODE & ONBOARDING TESTS ===\n');

  const testCases = [
    { input: 'kartik 401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: '401105 kartik', expectedName: 'Kartik', expectedPin: '401105' },
    { input: '401105kartik', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik   401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: '401105   kartik', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik\n401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: '401105\nkartik', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik, 401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'name: kartik pincode: 401105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'mera naam kartik hai aur pincode 401105 hai', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik parmar 401105', expectedName: 'Kartik Parmar', expectedPin: '401105' },
    { input: '401105 kartik parmar', expectedName: 'Kartik Parmar', expectedPin: '401105' },
    { input: 'kartik parmar401105', expectedName: 'Kartik Parmar', expectedPin: '401105' },
    { input: 'Kartik 401 105', expectedName: 'Kartik', expectedPin: '401105' },
    { input: '401105', knownName: 'Kartik', expectedName: 'Kartik', expectedPin: '401105' },
    { input: 'kartik', expectedName: 'Kartik', expectedPin: null }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const res = parseNameAndPincode(tc.input, tc.knownName);
    const nameMatch = res.name === tc.expectedName;
    const pinMatch = res.pin === tc.expectedPin;
    if (nameMatch && pinMatch) {
      console.log(`✅ [PASS] "${tc.input.replace(/\n/g, '\\n')}" => Name: "${res.name}", Pin: "${res.pin}"`);
      passed++;
    } else {
      console.error(`❌ [FAIL] "${tc.input.replace(/\n/g, '\\n')}" => Got Name: "${res?.name}", Pin: "${res?.pin}" | Expected Name: "${tc.expectedName}", Pin: "${tc.expectedPin}"`);
    }
  }

  console.log(`\nParser Results: ${passed}/${testCases.length} passed.`);

  console.log('\n=== TESTING INDIA POST API VALIDATION ===\n');

  const validPins = ['401105', '110001', '380001', '400001'];
  for (const p of validPins) {
    const check = await validateIndianPincode(p);
    if (check.isValid) {
      console.log(`✅ [VALID PIN] ${p} => City: ${check.city}, State: ${check.state}, Location: ${check.locationDisplay}`);
    } else {
      console.error(`❌ [UNEXPECTED INVALID] ${p} =>`, check);
    }
  }

  const invalidPins = ['999999', '123456', '000000', 'abcdef'];
  for (const p of invalidPins) {
    const check = await validateIndianPincode(p);
    if (!check.isValid) {
      console.log(`✅ [INVALID PIN CAUGHT] ${p} => Reason: ${check.reason}, Msg: ${check.message}`);
    } else {
      console.error(`❌ [UNEXPECTED VALID] ${p} =>`, check);
    }
  }

  console.log('\nAll validation checks completed!');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
