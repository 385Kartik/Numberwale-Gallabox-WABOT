import { isGstNumberQuery, getGstNumberExplanation, buildSystemPrompt, runAgent } from '../api/utils/aiAgent.js';

console.log('====================================================');
console.log('🧪 TESTING GST NUMBER / GSTIN RETRIEVAL & GUARDS');
console.log('====================================================');

// 1. Test isGstNumberQuery detection
const trueQueries = [
  'Aapka gst number kya hai?',
  'gst number do',
  'what is your gst number',
  'send your gst number',
  'gstin do',
  'company ka gst number kya hai',
  'share gst details',
  'gst certificate ya number',
  'give me your gst number',
  'gst number please',
  'gstin kya hai',
  'GST number'
];

const falseQueries = [
  '9876543210 ka invoice bhejo',
  'mera invoice download nahi ho raha',
  'hi',
  'kya 9999 available hai',
  'price kitna hai'
];

console.log('\n--- 1. Testing isGstNumberQuery ---');
for (const q of trueQueries) {
  const res = isGstNumberQuery(q);
  if (!res) throw new Error(`Failed to detect GST query: "${q}"`);
  console.log(`✅ [PASS] Detected: "${q}"`);
}

for (const q of falseQueries) {
  const res = isGstNumberQuery(q);
  if (res) throw new Error(`False positive on non-GST query: "${q}"`);
  console.log(`✅ [PASS] Correctly rejected: "${q}"`);
}

// 2. Test getGstNumberExplanation
console.log('\n--- 2. Testing getGstNumberExplanation content ---');
const expHinglish = getGstNumberExplanation('Hinglish', 'Kartik');
if (!expHinglish.includes('27BQXPS4248A1ZE')) throw new Error('Missing GSTIN in Hinglish explanation');
if (!expHinglish.includes('BQXPS4248A')) throw new Error('Missing PAN in Hinglish explanation');
console.log('✅ [PASS] Hinglish explanation has correct GSTIN (27BQXPS4248A1ZE) and PAN (BQXPS4248A)');

const expEnglish = getGstNumberExplanation('English', 'Rahul');
if (!expEnglish.includes('27BQXPS4248A1ZE')) throw new Error('Missing GSTIN in English explanation');
console.log('✅ [PASS] English explanation has correct GSTIN');

// 3. Test buildSystemPrompt
console.log('\n--- 3. Testing buildSystemPrompt facts ---');
const prompt = buildSystemPrompt({ customerName: 'Rahul', language: 'English' });
if (!prompt.includes('27BQXPS4248A1ZE')) throw new Error('buildSystemPrompt does not contain 27BQXPS4248A1ZE');
console.log('✅ [PASS] buildSystemPrompt contains official GSTIN 27BQXPS4248A1ZE');

// 4. Test runAgent fast intercept
console.log('\n--- 4. Testing runAgent Fast Intercept ---');
async function testAgentIntercept() {
  const res = await runAgent({
    userMessage: 'bhai aapka gst number kya hai?',
    customerContext: { phone: '919876543210', name: 'Pavan', language: 'Hinglish' }
  });

  if (res.model !== 'gst-number-guard') {
    throw new Error(`Expected model gst-number-guard, got: ${res.model}`);
  }
  if (!res.reply.includes('27BQXPS4248A1ZE')) {
    throw new Error(`Reply missing GST number: ${res.reply}`);
  }
  console.log('✅ [PASS] runAgent fast-intercepted query and returned 27BQXPS4248A1ZE without LLM delay');
}

testAgentIntercept().then(() => {
  console.log('\n🎉 ALL GST TESTS PASSED! 27BQXPS4248A1ZE is 100% verified! ✅');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
