import { pauseBot, resumeBot, isBotPaused } from '../utils/sessionStore.js';
import { updateCustomerInfo } from '../utils/analytics.js';

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

  const cleanPhone = phone.toString().replace(/\D/g, '');

  if (action === 'pause') {
    pauseBot(cleanPhone);
    await updateCustomerInfo(cleanPhone, { botState: 'PAUSED', agentReplied: true });
    return res.status(200).json({ 
      success: true, 
      message: `Bot paused for ${cleanPhone}. Agent can now handle freely.` 
    });
  }

  if (action === 'resume') {
    resumeBot(cleanPhone);
    await updateCustomerInfo(cleanPhone, { botState: 'ACTIVE', agentReplied: false });
    return res.status(200).json({ 
      success: true, 
      message: `Bot resumed for ${cleanPhone}.` 
    });
  }
}

