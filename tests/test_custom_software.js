import { 
  isCustomSoftwareQuery, 
  isCustomSoftwareQuoteQuery, 
  isBroadCustomSoftwareInquiry,
  getCustomSoftwareExplanation, 
  getCustomSoftwareQuoteHandoff,
  runAgent 
} from '../api/utils/aiAgent.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- 1. Testing isCustomSoftwareQuery ---');
  assert(isCustomSoftwareQuery('Devora website ke baare me batao'), 'Devora matches');
  assert(isCustomSoftwareQuery('mujhe custom software banwana hai'), 'Custom software matches');
  assert(isCustomSoftwareQuery('kya aap log whatsapp bot banate ho?'), 'WhatsApp bot matches');
  assert(isCustomSoftwareQuery('vendor bot ke baare me batao'), 'Vendor bot matches');
  assert(isCustomSoftwareQuery('chrome extension banani hai'), 'Chrome extension matches');
  assert(isCustomSoftwareQuery('business automation kaise hota hai?'), 'Business automation matches');
  assert(isCustomSoftwareQuery('website banwani hai'), 'Website matches');
  assert(isCustomSoftwareQuery('whatsapp interface aur team inbox'), 'WhatsApp interface & team inbox matches');
  assert(!isCustomSoftwareQuery('9999 ending VIP number chahiye'), 'VIP number query is NOT custom software');
  assert(!isCustomSoftwareQuery('Rahul 400001'), 'Onboarding name and pin is NOT custom software');

  console.log('\n--- 2. Testing isCustomSoftwareQuoteQuery ---');
  assert(isCustomSoftwareQuoteQuery('bot ka cost kitna lagega?'), 'Bot cost matches');
  assert(isCustomSoftwareQuoteQuery('custom software ka price kya hai?'), 'Custom software price matches');
  assert(isCustomSoftwareQuoteQuery('quote for whatsapp bot'), 'Quote for bot matches');
  assert(isCustomSoftwareQuoteQuery('website banwane ka kitna charge hoga?'), 'Website charge matches');
  assert(isCustomSoftwareQuoteQuery('pricing for automation'), 'Automation pricing matches');
  assert(isCustomSoftwareQuoteQuery('devora quote please'), 'Devora quote matches');

  // Contextual quote inquiry test
  const softwareHistory = [
    { role: 'user', text: 'kya aap log custom software banate ho?' },
    { role: 'bot', text: 'Ji haan, hum Devora aur Numberwale Tech Solutions ke through custom software aur AI bots provide karte hain!' }
  ];
  assert(isCustomSoftwareQuoteQuery('quote please', softwareHistory), 'Contextual quote in software history matches');
  assert(isCustomSoftwareQuoteQuery('pricing kya hai?', softwareHistory), 'Contextual pricing in software history matches');
  assert(isCustomSoftwareQuoteQuery('kitna charge lagega?', softwareHistory), 'Contextual charge in software history matches');

  // Normal VIP number pricing is NOT custom software quote
  assert(!isCustomSoftwareQuoteQuery('9820098200 ka price kya hai?'), 'VIP number price query is NOT software quote');
  assert(!isCustomSoftwareQuoteQuery('9999 ending number ka rate batao'), 'VIP pattern rate is NOT software quote');

  console.log('\n--- 3. Testing getCustomSoftwareExplanation & Handoff Text ---');
  const expHinglish = getCustomSoftwareExplanation('Hinglish');
  assert(expHinglish.includes('Devora') && expHinglish.includes('WhatsApp AI') && expHinglish.includes('Chrome Extensions'), 'Hinglish explanation covers all modules');
  const expEng = getCustomSoftwareExplanation('English');
  assert(expEng.includes('Devora') && expEng.includes('Customer Support Bot') && expEng.includes('Atomic'), 'English explanation covers all modules');

  const handoffHinglish = getCustomSoftwareQuoteHandoff('Hinglish');
  assert(handoffHinglish.includes('technical solutions') && handoffHinglish.includes('customized'), 'Handoff mentions technical team');

  console.log('\n--- 4. Testing runAgent for Custom Software Quote Escalation ---');
  const quoteResult = await runAgent({
    userMessage: 'mujhe ek whatsapp vendor bot banwana hai, pricing ya quote kya hoga?',
    customerContext: { phone: '919876543210', language: 'Hinglish' }
  });

  assert(quoteResult.escalate === true, 'runAgent escalates on custom software quote');
  assert(quoteResult.escalateReason.includes('Custom Software / AI'), 'runAgent sets correct escalateReason');
  assert(quoteResult.searchJSON === null, 'runAgent does NOT output searchJSON on software inquiry');

  console.log('\n--- 5. Testing runAgent for General Custom Software Inquiry ---');
  const infoResult = await runAgent({
    userMessage: 'kya aap log custom software aur whatsapp bot bhi banate ho?',
    customerContext: { phone: '919876543210', language: 'Hinglish' }
  });

  assert(infoResult.escalate === false, 'runAgent does NOT escalate on general info inquiry');
  assert(infoResult.reply.includes('Devora') && infoResult.reply.includes('WhatsApp'), 'runAgent returns comprehensive explanation');
  console.log('\n--- 6. Testing Exact Website CTA & Follow-up Flow ---');
  const exactCTA = "Hey! I want to know more about AI and custom software or automated softwares.";
  assert(isCustomSoftwareQuery(exactCTA), 'Exact website CTA matches isCustomSoftwareQuery');
  assert(isBroadCustomSoftwareInquiry(exactCTA), 'Exact website CTA matches isBroadCustomSoftwareInquiry');

  const ctaResult = await runAgent({
    userMessage: exactCTA,
    customerContext: { phone: '919619410050', language: 'English' }
  });
  assert(ctaResult.escalate === false, 'Website CTA does NOT escalate or pause');
  assert(ctaResult.reply.includes('Devora') && ctaResult.reply.includes('WhatsApp'), 'Website CTA returns full software capabilities');

  // Follow up inquiry
  const followUpHistory = [
    { role: 'user', text: exactCTA },
    { role: 'bot', text: ctaResult.reply }
  ];
  const followUpMsg = "what can you do for my business?";
  assert(isCustomSoftwareQuery(followUpMsg, followUpHistory), 'Follow-up "what can you do for my business?" matches isCustomSoftwareQuery with history');

  const followUpResult = await runAgent({
    userMessage: followUpMsg,
    customerContext: { phone: '919619410050', language: 'English', history: followUpHistory }
  });
  assert(followUpResult.escalate === false, 'Follow-up does NOT escalate');
  assert(followUpResult.reply.length > 50, 'Follow-up returns proper explanation');

  console.log(`\n================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
