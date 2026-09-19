import { isCancellationOrRefundQuery, runAgent } from '../api/utils/aiAgent.js';
import dotenv from 'dotenv';
dotenv.config();

async function testCancellationRefund() {
  console.log('==================================================');
  console.log('TESTING CANCELLATION & REFUND BOT BEHAVIOR');
  console.log('==================================================\n');

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

  // 1. Test Query Classifier
  console.log('--- TEST 1: isCancellationOrRefundQuery Classifier ---');
  const positiveQueries = [
    'mujhe order cancel karna hai',
    'mera refund kab aayega',
    'please cancel my order',
    'i want refund',
    'paisa wapas chahiye',
    'paise wapas kardo',
    'cancel this number',
    'cancellation process kya hai',
    'refund chahiye',
    'order radd kardo'
  ];

  for (const q of positiveQueries) {
    assert(isCancellationOrRefundQuery(q) === true, `Should detect positive query: "${q}"`);
  }

  const negativeQueries = [
    'mujhe 9999 ending number chahiye',
    'mera budget 25000 hai',
    'more',
    'buy 9619410050',
    'mirror numbers dikhao',
    'mera naam rahul hai 400001'
  ];

  for (const q of negativeQueries) {
    assert(isCancellationOrRefundQuery(q) === false, `Should NOT flag normal query: "${q}"`);
  }

  // 2. Test runAgent Fast Interceptor for different languages
  console.log('\n--- TEST 2: runAgent Fast Interceptor across languages ---');
  const languages = ['English', 'Hindi', 'Gujarati', 'Marathi', 'Hinglish'];
  for (const lang of languages) {
    const res = await runAgent({
      userMessage: 'refund please',
      customerContext: {
        phone: '919876543210',
        name: 'Test Customer',
        language: lang,
        history: []
      }
    });

    assert(res.escalate === true, `[${lang}] should escalate`);
    assert(res.model === 'cancellation-refund-guard', `[${lang}] should use cancellation-refund-guard`);
    assert(!res.reply.includes('/reorder'), `[${lang}] no fake /reorder link`);
    assert(!res.reply.toLowerCase().includes('5 to 7'), `[${lang}] no 5-7 days promise`);
    assert(res.reply.includes('executive') || res.reply.includes('agent') || res.reply.includes('એક્ઝિક્યુટિવ') || res.reply.includes('एक्झिक्युटिव्ह'), `[${lang}] mentions executive/agent`);
  }

  console.log('\n==================================================');
  console.log(`TESTS COMPLETED: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testCancellationRefund().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
