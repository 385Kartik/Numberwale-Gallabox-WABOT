import handler from './api/webhook.js';
import dotenv from 'dotenv';
dotenv.config();

async function makeRequest(message) {
  const req = {
    method: 'POST',
    body: {
      event: "Message.Received",
      contact: { phone: "919619410050" },
      message: { text: message }
    }
  };

  const res = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
      console.log(`\n=== Response (Status: ${this.statusCode}) ===`);
      console.log(data.reply || data);
      console.log(`====================================\n`);
    }
  };

  await handler(req, res);
}

async function runTest() {
  console.log("=== Starting Local Webhook Test ===\n");

  if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY is missing in .env!");
    return;
  }

  // Test 1: Fresh search
  console.log("📍 Test 1: Fresh Search");
  await makeRequest("mujhe kuch vip numbers batao");

  // Small delay
  // await new Promise(r => setTimeout(r, 1000));

  // Test 2: Show more (should fetch page 2 of same query)
  // console.log("📍 Test 2: Show More");
  // await makeRequest("show more");

  // Test 3: Show more again (page 3)
  // console.log("📍 Test 3: Show More Again");
  // await makeRequest("aur dikhao");
}

runTest();
