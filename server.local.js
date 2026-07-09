/**
 * Local development server for testing Gallabox API functions.
 * Run: node server.local.js
 * 
 * This wraps the Vercel serverless functions as a simple Express-like HTTP server.
 * Does NOT need vercel dev — just plain Node.js.
 */

import 'dotenv/config';
import http from 'http';
import { URL } from 'url';

// Import our API handlers
import webhookHandler from './api/webhook.js';
import analyticsHandler from './api/analytics.js';
import cartWebhookHandler from './api/cart-webhook.js';

// Start cron jobs (drip campaign etc.)
import { startDripCron } from './api/cron/dripCron.js';
startDripCron();

const PORT = 3001;

// Build a minimal req/res pair that mimics Vercel's interface
function buildReqRes(nodeReq, nodeRes, body) {
  const urlObj = new URL(nodeReq.url, `http://localhost:${PORT}`);

  const req = {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query: Object.fromEntries(urlObj.searchParams.entries()),
    body,
  };

  const res = {
    _status: 200,
    _headers: { 'Content-Type': 'application/json' },
    status(code) { this._status = code; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    json(data) {
      nodeRes.writeHead(this._status, this._headers);
      nodeRes.end(JSON.stringify(data));
    },
    end() {
      nodeRes.writeHead(this._status, this._headers);
      nodeRes.end();
    },
  };

  return { req, res };
}

const server = http.createServer((nodeReq, nodeRes) => {
  // CORS for admin frontend
  nodeRes.setHeader('Access-Control-Allow-Origin', '*');
  nodeRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret, x-cart-secret');

  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(200);
    nodeRes.end();
    return;
  }

  const path = new URL(nodeReq.url, `http://localhost:${PORT}`).pathname;

  // Collect request body
  let rawBody = '';
  nodeReq.on('data', (chunk) => { rawBody += chunk; });
  nodeReq.on('end', async () => {
    let body = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {}

    const { req, res } = buildReqRes(nodeReq, nodeRes, body);

    try {
      if (path === '/api/webhook') {
        await webhookHandler(req, res);
      } else if (path === '/api/analytics') {
        await analyticsHandler(req, res);
      } else if (path === '/api/cart-webhook') {
        await cartWebhookHandler(req, res);
      } else {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: 'Not found', availableRoutes: ['/api/webhook', '/api/analytics', '/api/cart-webhook'] }));
      }
    } catch (err) {
      console.error('Handler error:', err);
      nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🤖 Numberwale Gallabox — Local Dev Server  ║
╠════════════════════════════════════════════╣
║  Webhook:   http://localhost:${PORT}/api/webhook  ║
║  Analytics: http://localhost:${PORT}/api/analytics ║
╚════════════════════════════════════════════╝
  `);
  console.log('Loaded env:', {
    GROQ_API_KEY:    process.env.GROQ_API_KEY    ? '✅ set' : '❌ missing',
    MONGODB_URI:     process.env.MONGODB_URI     ? '✅ set' : '❌ missing',
    GALLABOX_API_KEY: process.env.GALLABOX_API_KEY ? '✅ set' : '❌ missing',
  });
});
