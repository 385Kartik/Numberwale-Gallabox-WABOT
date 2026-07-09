/**
 * Cart Abandonment Webhook
 * ─────────────────────────────────────────────────────
 * Receives events from the Numberwale website when a user adds a VIP number
 * to their cart without completing checkout.
 *
 * Called by the website immediately on "Add to Cart" (user is logged in).
 * Sends an instant WhatsApp message and starts the 7-day drip campaign.
 *
 * Security: Validated via x-cart-secret header (set CART_WEBHOOK_SECRET in .env)
 *
 * Expected body:
 * {
 *   "phone":        "919619410050",    // E.164, with country code
 *   "name":         "Kartik Parmar",   // User's name from website profile
 *   "numberValue":  "9769670859",      // 10-digit VIP number
 *   "numberDisplay":"97696 70859",     // Formatted display string
 *   "price":        7552,              // Total price in INR (incl. GST)
 *   "cartLink":     "https://numberwale.com/checkout?cartId=abc123",
 *   "cartId":       "abc123"           // Optional, for reference
 * }
 */

import { startCartDrip, getCustomerContext } from './utils/analytics.js';
import { sendToGallabox } from './utils/gallabox.js';

export default async function cartWebhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const CART_SECRET = process.env.CART_WEBHOOK_SECRET;
  if (CART_SECRET && req.headers['x-cart-secret'] !== CART_SECRET) {
    console.warn('[CartWebhook] ⛔ Unauthorized request — invalid secret.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const { phone, name, numberValue, numberDisplay, price, cartLink, cartId } = body;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!phone || !cartLink) {
    return res.status(400).json({ error: 'phone and cartLink are required.' });
  }

  // Normalize phone: ensure it has country code but no + prefix
  const normalizedPhone = String(phone).replace(/\D/g, '');
  if (normalizedPhone.length < 10) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  console.log(`[CartWebhook] Cart event — phone: ${normalizedPhone}, number: ${numberValue}, cartId: ${cartId}`);

  // ── Check if agent is currently handling this user ────────────────────────
  let customerContext = {};
  try {
    customerContext = await getCustomerContext(normalizedPhone);
  } catch (_) {}

  const isAgentHandling = customerContext.botState === 'PAUSED';

  // ── Start drip campaign in DB ─────────────────────────────────────────────
  // Always save cart data so drip cron picks it up.
  await startCartDrip(normalizedPhone, {
    name:          name || '',
    cartNumber:    numberValue || '',
    cartNumberRaw: numberDisplay || numberValue || '',
    cartPrice:     price || null,
    cartLink,
  });

  // ── Send instant WhatsApp cart abandonment message ─────────────────────────
  // Send even if agent is handling — it's a transactional cart message, not drip.
  const formattedPrice = price ? `₹${Number(price).toLocaleString('en-IN')}` : '';
  const displayNumber  = numberDisplay || numberValue || '';

  const instantMessage =
    `🛒 Hi${name ? ` ${name}` : ''}! You added a VIP number to your cart — don't let it go!\n\n` +
    `📞 *${displayNumber}*\n` +
    (formattedPrice ? `💰 Price: ${formattedPrice}\n` : '') +
    `\n✅ Complete your purchase — checkout is just one click away:\n` +
    `👉 ${cartLink}\n\n` +
    `This number is in high demand and may sell soon! 🔥`;

  try {
    await sendToGallabox(normalizedPhone, instantMessage);
    console.log(`[CartWebhook] ✅ Instant cart message sent to ${normalizedPhone}`);
  } catch (err) {
    console.error(`[CartWebhook] ❌ Failed to send instant message:`, err.message);
    // Drip is still started even if instant message failed
  }

  return res.status(200).json({
    success: true,
    message: 'Cart event processed. Drip campaign started.',
    phone: normalizedPhone,
    agentHandling: isAgentHandling,
  });
}
