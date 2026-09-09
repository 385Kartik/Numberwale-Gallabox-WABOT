import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Import route handlers
import webhookHandler from './api/webhook.js';
import analyticsHandler from './api/analytics.js';
import botControlHandler from './api/admin/bot-control.js';
import { ensureSlotsBuilt } from './api/utils/aiParser.js';
const app = express();
const PORT = process.env.PORT || 3001;

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Numberwale Gallabox Chatbot Server',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.post('/api/webhook', webhookHandler);
app.get('/api/analytics', analyticsHandler);
app.post('/api/admin/bot-control', botControlHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🤖 Numberwale Gallabox — Backend Server   ║
╠════════════════════════════════════════════╣
║  URL:       http://localhost:${PORT}          ║
║  Webhook:   POST /api/webhook              ║
║  Analytics: GET /api/analytics             ║
║  Control:   POST /api/admin/bot-control    ║
╚════════════════════════════════════════════╝
  `);
  const hasAdminBotSecret = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET;
  console.log('Environment configuration status:', {
    MONGODB_URI: process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing',
    GALLABOX_API_KEY: process.env.GALLABOX_API_KEY ? '✅ Configured' : '❌ Missing',
    GALLABOX_API_SECRET: process.env.GALLABOX_API_SECRET ? '✅ Configured' : '❌ Missing',
    GALLABOX_CHANNEL_ID: process.env.GALLABOX_CHANNEL_ID ? '✅ Configured' : '⚡ Dynamic (extracted from incoming webhook, fallback optional)',
    GALLABOX_ACCOUNT_ID: process.env.GALLABOX_ACCOUNT_ID ? '✅ Configured' : 'ℹ️ Not needed (unassign disabled)',
    ADMIN_SECRET: process.env.ADMIN_SECRET ? '✅ Configured' : '❌ Missing',
    ADMIN_BOT_SECRET: hasAdminBotSecret ? (process.env.ADMIN_BOT_SECRET ? '✅ Configured' : '✅ Fallback to ADMIN_SECRET') : '❌ Missing',
    MAIN_API_URL: process.env.MAIN_API_URL ? `✅ ${process.env.MAIN_API_URL}` : '⚡ Default (https://api.numberwale.com)',
    OPENAI_KEY: (process.env.OPENAI_API_KEY || process.env.OPENAI) ? '✅ Configured (Tier 4 Paid Safety Net)' : 'ℹ️ None (Using Groq/OpenRouter)',
    ALLOWED_PHONES: process.env.ALLOWED_PHONES ? `🔒 Whitelist Active (${process.env.ALLOWED_PHONES})` : '🌐 Open to All Users',
  });
  ensureSlotsBuilt().catch(() => {});
});
