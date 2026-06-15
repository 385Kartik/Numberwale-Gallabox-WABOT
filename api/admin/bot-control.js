import { pauseBot, resumeBot, isBotPaused } from './utils/sessionStore.js';

/**
 * Admin endpoint to pause/resume bot for a specific customer phone.
 * 
 * POST /api/admin/bot-control
 * Body: { "phone": "919876543210", "action": "pause" | "resume" }
 * Headers: { "x-admin-key": "<ADMIN_SECRET>" }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Simple secret key auth — set ADMIN_SECRET in your .env
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { phone, action } = req.body;

  if (!phone || !action) {
    return res.status(400).json({ error: 'phone and action are required' });
  }

  if (!['pause', 'resume'].includes(action)) {
    return res.status(400).json({ error: 'action must be "pause" or "resume"' });
  }

  if (action === 'pause') {
    pauseBot(phone);
    return res.status(200).json({ 
      success: true, 
      message: `Bot paused for ${phone}. Agent can now handle freely.` 
    });
  }

  if (action === 'resume') {
    resumeBot(phone);
    return res.status(200).json({ 
      success: true, 
      message: `Bot resumed for ${phone}.` 
    });
  }
}
