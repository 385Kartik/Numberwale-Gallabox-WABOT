import { pauseBot, resumeBot } from '../utils/sessionStore.js';
import { 
  updateCustomerInfo, 
  getGlobalBotConfig, 
  updateGlobalBotConfig, 
  getRecentCustomerChats 
} from '../utils/analytics.js';

/**
 * Admin endpoint to control WhatsApp Bot:
 * - GET: Check live global status, modes, whitelist, server info, and recent chats.
 * - POST: Toggle global ON/OFF, change mode, update whitelist, or pause/resume specific customer.
 */
export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Admin Authentication Check
  const adminSecret = process.env.ADMIN_SECRET || process.env.ADMIN_BOT_SECRET;
  const providedKey = req.headers['x-admin-key'] || 
                      req.headers['x-admin-secret'] || 
                      req.headers['x-bot-secret'] || 
                      req.query?.secret;

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = clientIp.includes('127.0.0.1') || clientIp.includes('::1');

  // Only protect mutating POST requests from external non-localhost callers
  if (req.method !== 'GET' && !isLocalhost && adminSecret && providedKey !== adminSecret) {
    console.warn('[AdminControl] ⚠️ Unauthorized access attempt from:', clientIp);
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
  }

  try {
    // ─── GET: Fetch Live Status ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const config = await getGlobalBotConfig();
      const recentChats = await getRecentCustomerChats(30);

      return res.status(200).json({
        success: true,
        config: {
          isGlobalEnabled: config.isGlobalEnabled ?? true,
          botMode: config.botMode || 'FULL',
          isWhitelistOnly: config.isWhitelistOnly ?? false,
          whitelistPhones: config.whitelistPhones || [],
          disabledReason: config.disabledReason || '',
          disabledAt: config.disabledAt || null,
          updatedBy: config.updatedBy || 'system',
          updatedAt: config.updatedAt || new Date()
        },
        server: {
          uptimeSeconds: Math.round(process.uptime()),
          nodeVersion: process.version,
          envWhitelist: process.env.ALLOWED_PHONES || null,
          hasOpenAI: !!(process.env.OPENAI_API_KEY || process.env.OPENAI),
          hasGroq: !!process.env.GROQ_API_KEY,
          timestamp: new Date().toISOString()
        },
        recentChats
      });
    }

    // ─── POST: Actions ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (!action) {
        return res.status(400).json({ error: 'action is required' });
      }

      // 1. Toggle Global Bot ON / OFF (Emergency Kill-Switch)
      if (action === 'toggle_global') {
        const isGlobalEnabled = Boolean(req.body.isGlobalEnabled);
        const disabledReason = req.body.disabledReason || (isGlobalEnabled ? '' : 'Paused via Admin CRM');
        const disabledAt = isGlobalEnabled ? null : new Date();
        const updatedBy = req.body.updatedBy || 'admin';

        const updated = await updateGlobalBotConfig({
          isGlobalEnabled,
          disabledReason,
          disabledAt
        }, updatedBy);

        console.log(`[AdminControl] 🚨 Master Switch changed: Bot is now ${isGlobalEnabled ? '🟢 ON' : '🔴 OFF'} by ${updatedBy}`);
        return res.status(200).json({
          success: true,
          message: `Bot globally ${isGlobalEnabled ? 'activated' : 'paused'}.`,
          config: updated
        });
      }

      // 2. Set Bot Operational Mode (FULL | CATALOG_ONLY | OFF)
      if (action === 'set_mode') {
        const { botMode } = req.body;
        if (!['FULL', 'CATALOG_ONLY', 'OFF'].includes(botMode)) {
          return res.status(400).json({ error: 'Invalid botMode. Must be FULL, CATALOG_ONLY, or OFF.' });
        }

        const isGlobalEnabled = botMode !== 'OFF';
        const updated = await updateGlobalBotConfig({
          botMode,
          isGlobalEnabled
        }, req.body.updatedBy || 'admin');

        console.log(`[AdminControl] 🎛️ Bot mode updated to ${botMode}`);
        return res.status(200).json({
          success: true,
          message: `Bot mode set to ${botMode}.`,
          config: updated
        });
      }

      // 3. Update Whitelist Mode & Phones
      if (action === 'update_whitelist') {
        const isWhitelistOnly = Boolean(req.body.isWhitelistOnly);
        let whitelistPhones = req.body.whitelistPhones;
        if (Array.isArray(whitelistPhones)) {
          whitelistPhones = whitelistPhones.map(p => String(p).replace(/\D/g, '')).filter(Boolean);
        } else if (typeof whitelistPhones === 'string') {
          whitelistPhones = whitelistPhones.split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
        } else {
          whitelistPhones = [];
        }

        const updated = await updateGlobalBotConfig({
          isWhitelistOnly,
          whitelistPhones
        }, req.body.updatedBy || 'admin');

        console.log(`[AdminControl] 🔒 Whitelist updated: ${isWhitelistOnly ? 'ENABLED' : 'DISABLED'} (${whitelistPhones.length} numbers)`);
        return res.status(200).json({
          success: true,
          message: `Whitelist updated (${whitelistPhones.length} numbers).`,
          config: updated
        });
      }

      // 4. Pause Specific Customer Phone
      if (action === 'pause') {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone is required' });
        const cleanPhone = String(phone).replace(/\D/g, '');

        pauseBot(cleanPhone);
        await updateCustomerInfo(cleanPhone, { botState: 'PAUSED', agentReplied: true, lastAgentReplyAt: new Date() });
        return res.status(200).json({
          success: true,
          message: `Bot paused for customer ${cleanPhone}.`
        });
      }

      // 5. Resume Specific Customer Phone
      if (action === 'resume') {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone is required' });
        const cleanPhone = String(phone).replace(/\D/g, '');

        resumeBot(cleanPhone);
        await updateCustomerInfo(cleanPhone, { botState: 'ACTIVE', agentReplied: false });
        return res.status(200).json({
          success: true,
          message: `Bot resumed for customer ${cleanPhone}.`
        });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[AdminControl] Handler error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

