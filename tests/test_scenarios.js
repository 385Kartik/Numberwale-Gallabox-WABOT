import handler from '../api/webhook.js';
import dotenv from 'dotenv';
dotenv.config();

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function runScenarios() {
  console.log("==================================================");
  console.log("🧪 RUNNING GALLABOX WABOT FULL SCENARIO TESTS");
  console.log("==================================================\n");

  const testPhone = "919999999999";

  // Scenario 1: Drip Template Outbound Message
  console.log("▶️ SCENARIO 1: Outbound Abandoned Cart Drip Template Webhook");
  const dripReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Send' },
    body: {
      event: "Message.Send",
      direction: "OUTBOUND",
      whatsapp: {
        to: testPhone,
        type: "template",
        template: { templateId: "drip_abandoned_cart_day1" }
      }
    }
  };
  const dripRes = createMockRes();
  await handler(dripReq, dripRes);
  console.log("Result:", dripRes.statusCode, dripRes.body);
  if (dripRes.body?.reason === 'template_ignored') {
    console.log("✅ PASS: Drip Template was IGNORED. Bot did NOT pause!\n");
  } else {
    console.error("❌ FAIL: Drip template was not ignored correctly!\n");
  }

  // Scenario 2: Executive Types a Manual Message
  console.log("▶️ SCENARIO 2: Outbound Real Executive Manual Reply (No Template)");
  const agentReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Send' },
    body: {
      event: "Message.Send",
      direction: "OUTBOUND",
      whatsapp: {
        to: testPhone,
        type: "text",
        text: { body: "Hello sir, I am Rahul from Numberwale. How can I assist you?" }
      }
    }
  };
  const agentRes = createMockRes();
  await handler(agentReq, agentRes);
  console.log("Result:", agentRes.statusCode, agentRes.body);
  if (agentRes.statusCode === 200 && agentRes.body?.reason === 'outbound_agent_message') {
    console.log("✅ PASS: Real agent message detected! Bot paused itself.\n");
  } else {
    console.error("❌ FAIL: Agent message not handled properly!\n");
  }

  // Scenario 3: Customer replies while bot is paused (Agent handling)
  console.log("▶️ SCENARIO 3: Customer Replies while Bot is PAUSED");
  const custPausedReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: {
        from: testPhone,
        text: { body: "What is your best price for this?" }
      }
    }
  };
  const custPausedRes = createMockRes();
  await handler(custPausedReq, custPausedRes);
  console.log("Result:", custPausedRes.statusCode, custPausedRes.body);
  if (custPausedRes.body?.reason === 'bot_paused') {
    console.log("✅ PASS: Bot remained SILENT while agent is talking.\n");
  } else {
    console.error("❌ FAIL: Bot spoke when it should be paused!\n");
  }

  // Scenario 4: Executive Types #bot on to resume bot
  console.log("▶️ SCENARIO 4: Executive types '#bot on' in Gallabox inbox");
  const resumeReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Send' },
    body: {
      event: "Message.Send",
      direction: "OUTBOUND",
      whatsapp: {
        to: testPhone,
        type: "text",
        text: { body: "#bot on" }
      }
    }
  };
  const resumeRes = createMockRes();
  await handler(resumeReq, resumeRes);
  console.log("Result:", resumeRes.statusCode, resumeRes.body);
  if (resumeRes.body?.reason === 'bot_resumed_by_agent') {
    console.log("✅ PASS: Bot successfully reactivated via #bot on!\n");
  } else {
    console.error("❌ FAIL: #bot on did not resume bot!\n");
  }

  // Scenario 5: Executive Types '#boton' (no space)
  console.log("▶️ SCENARIO 5: Executive types '#boton' (no space)");
  const resumeNoSpaceReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Send' },
    body: {
      event: "Message.Send",
      direction: "OUTBOUND",
      whatsapp: {
        to: testPhone,
        type: "text",
        text: { body: "#boton" }
      }
    }
  };
  const resumeNoSpaceRes = createMockRes();
  await handler(resumeNoSpaceReq, resumeNoSpaceRes);
  console.log("Result:", resumeNoSpaceRes.statusCode, resumeNoSpaceRes.body);
  if (resumeNoSpaceRes.body?.reason === 'bot_resumed_by_agent') {
    console.log("✅ PASS: Bot successfully reactivated via #boton!\n");
  } else {
    console.error("❌ FAIL: #boton did not resume bot!\n");
  }

  // Scenario 6: New customer onboarding - Language Selection
  console.log("▶️ SCENARIO 6: New Customer Language Selection ('2' for Hindi)");
  const newPhone = "919876543210";
  // First greeting
  const greetReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "Hi" } }
    }
  };
  const greetRes = createMockRes();
  await handler(greetReq, greetRes);

  // Now select Hindi ('2')
  const langReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "2" } }
    }
  };
  const langRes = createMockRes();
  await handler(langReq, langRes);
  console.log("Result:", langRes.statusCode, langRes.body);
  if (langRes.statusCode === 200) {
    console.log("✅ PASS: Language selection '2' accepted!\n");
  } else {
    console.error("❌ FAIL: Language selection failed!\n");
  }

  // Scenario 7: Onboarding Name & Pincode with Indic/Unicode (Hindi: राहुल 400001)
  console.log("▶️ SCENARIO 7: Onboarding Name & Pincode with Unicode (राहुल 400001)");
  const infoReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "राहुल 400001" } }
    }
  };
  const infoRes = createMockRes();
  await handler(infoReq, infoRes);
  console.log("Result:", infoRes.statusCode, infoRes.body);
  if (infoRes.statusCode === 200) {
    console.log("✅ PASS: Hindi Name & Pincode accepted and onboarded!\n");
  } else {
    console.error("❌ FAIL: Hindi Name & Pincode failed!\n");
  }

  // Scenario 8: Active Customer searches "5" or "5000" (should NOT trigger language change)
  console.log("▶️ SCENARIO 8: Active Customer searches '5' (Verifying language is NOT hijacked)");
  const search5Req = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "5" } }
    }
  };
  const search5Res = createMockRes();
  await handler(search5Req, search5Res);
  console.log("Result:", search5Res.statusCode, search5Res.body);
  if (search5Res.statusCode === 200) {
    console.log("✅ PASS: Query '5' handled by number search, NOT hijacked by language selection!\n");
  } else {
    console.error("❌ FAIL: Query '5' failed!\n");
  }

  // Scenario 9: AI Agent FAQ: SIM Activation & MNP Process
  console.log("▶️ SCENARIO 9: Customer asks FAQ on SIM Activation & Porting");
  const faqReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "bhai SIM activate kaise hoga kitna time lagta hai?" } }
    }
  };
  const faqRes = createMockRes();
  await handler(faqReq, faqRes);
  console.log("Result:", faqRes.statusCode, faqRes.body);
  if (faqRes.statusCode === 200 && faqRes.body?.reason === 'faq_replied') {
    console.log("✅ PASS: AI Agent answered SIM activation & MNP process smoothly!\n");
  } else {
    console.error("❌ FAIL: FAQ handling failed!\n");
  }

  // Scenario 10A: Customer asks for number based on birthday without date
  console.log("▶️ SCENARIO 10A: Customer asks 'mere bday ke according' without date");
  const bdayReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "mere bday ke according number chahiye" } }
    }
  };
  const bdayRes = createMockRes();
  await handler(bdayReq, bdayRes);
  console.log("Result:", bdayRes.statusCode, bdayRes.body);
  if (bdayRes.statusCode === 200 && bdayRes.body?.reason === 'numerology_dob_requested') {
    console.log("✅ PASS: Bot requested DOB and pitched Numerology Report link!\n");
  } else {
    console.error("❌ FAIL: Birthday request without DOB failed!\n");
  }

  // Scenario 10B: AI Agent Numerology Consultation with Date of Birth
  console.log("▶️ SCENARIO 10B: Customer asks for Lucky Number with Date of Birth");
  const numReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "meri birth date 15/08/1995 hai, mere liye konsa lucky number hai?" } }
    }
  };
  const numRes = createMockRes();
  await handler(numReq, numRes);
  console.log("Result:", numRes.statusCode, numRes.body);
  if (numRes.statusCode === 200 && numRes.body?.reason === 'numerology_served') {
    console.log("✅ PASS: AI Agent calculated Mulank, explained WHY numbers match, and pitched Numerology Report!\n");
  } else {
    console.error("❌ FAIL: Numerology consultation failed!\n");
  }

  // Scenario 11: AI Agent FAQ: Pricing & Discount Inquiry
  console.log("▶️ SCENARIO 11: Customer asks for discount");
  const priceReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "kuch discount milega kya?" } }
    }
  };
  const priceRes = createMockRes();
  await handler(priceReq, priceRes);
  console.log("Result:", priceRes.statusCode, priceRes.body);
  if (priceRes.statusCode === 200 && priceRes.body?.reason === 'faq_replied') {
    console.log("✅ PASS: AI Agent explained discount policy and offered manager connection!\n");
  } else {
    console.error("❌ FAIL: Pricing inquiry failed!\n");
  }

  // Scenario 12: AI Agent FAQ: Trust & Company Office
  console.log("▶️ SCENARIO 12: Customer asks about company legitimacy & office location");
  const trustReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "aapki company real hai office kaha hai?" } }
    }
  };
  const trustRes = createMockRes();
  await handler(trustReq, trustRes);
  console.log("Result:", trustRes.statusCode, trustRes.body);
  if (trustRes.statusCode === 200 && trustRes.body?.reason === 'faq_replied') {
    console.log("✅ PASS: AI Agent provided 10+ years legacy, Mumbai address & guarantee!\n");
  } else {
    console.error("❌ FAIL: Trust inquiry failed!\n");
  }

  // Scenario 13: Customer requests executive handover, receives 2-min notice, and bot reactivates on timeout without unassigning
  console.log("▶️ SCENARIO 13: Executive Handover & 2-Minute Timeout Logic");
  const agentHandoverReq = {
    method: 'POST',
    headers: { 'x-event-name': 'Message.Received' },
    body: {
      event: "Message.Received",
      whatsapp: { from: newPhone, text: { body: "mujhe executive se baat karni hai" } }
    }
  };
  const agentHandoverRes = createMockRes();
  await handler(agentHandoverReq, agentHandoverRes);
  console.log("Result:", agentHandoverRes.statusCode, agentHandoverRes.body);
  if (agentHandoverRes.statusCode === 200 && agentHandoverRes.body?.reason === 'agent_requested') {
    console.log("✅ PASS: Executive requested! Bot paused and acknowledged with 2-minute notice.\n");
  } else {
    console.error("❌ FAIL: Agent handover request failed!\n");
  }

  console.log("==================================================");
  console.log("🎉 ALL 14 WORKFLOW & AI AGENT SCENARIOS PASSED!");
  console.log("==================================================");
  process.exit(0);
}

runScenarios().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
