/**
 * Daily Cart Abandonment Drip Cron
 * ─────────────────────────────────────────────────────
 * Runs every day at 10:00 AM IST (04:30 UTC).
 * Sends one follow-up message per day to users who added a VIP number
 * to their cart but didn't purchase (for up to 7 days).
 *
 * Rules:
 *  - Skip if user is PAUSED (agent is handling)
 *  - Skip if user was active with bot in last 6 hours
 *  - Stop after day 7 or when purchase is detected
 *  - English only
 */

import cron from 'node-cron';
import { getActiveDripUsers, advanceDripDay } from '../utils/analytics.js';
import { sendToGallabox } from '../utils/gallabox.js';

// ─── Drip Message Templates ────────────────────────────────────────────────────
// Each function receives the user's cart data and returns the message string.
const DRIP_MESSAGES = [
  // Day 1
  (u) => `👋 Hi${u.cartName ? ` ${u.cartName}` : ''}! You added a VIP number to your cart but didn't complete the purchase.\n\n📞 *${u.cartNumberRaw || u.cartNumber}*\n💰 Price: ₹${u.cartPrice?.toLocaleString('en-IN') || '—'}\n\n👉 Complete checkout here:\n${u.cartLink}\n\nDon't let it slip away! 🔥`,

  // Day 2
  (u) => `📲 Still thinking about your VIP number?\n\n*${u.cartNumberRaw || u.cartNumber}* is still available!\n\n✅ Secure it now before someone else does:\n${u.cartLink}`,

  // Day 3
  (u) => `🔥 VIP numbers with great patterns sell fast!\n\nYour saved number *${u.cartNumberRaw || u.cartNumber}* won't wait forever.\n\n👉 Checkout: ${u.cartLink}\n\nNeed help? Type *agent* and our team will assist you! 🙋`,

  // Day 4
  (u) => `💡 Did you know?\n\nA VIP number like *${u.cartNumberRaw || u.cartNumber}* makes your business instantly memorable — clients remember it, partners recognize it!\n\n🛒 Your cart is saved: ${u.cartLink}`,

  // Day 5
  (u) => `📞 Quick reminder — your VIP number is waiting!\n\n*${u.cartNumberRaw || u.cartNumber}* — ₹${u.cartPrice?.toLocaleString('en-IN') || '—'}\n\nWe accept UPI, Credit/Debit Card, Net Banking & more.\n\n👉 ${u.cartLink}`,

  // Day 6
  (u) => `⚡ Almost missed it!\n\nVIP number *${u.cartNumberRaw || u.cartNumber}* is still in your cart. These numbers are limited — once sold, they're gone forever.\n\n🛒 Grab it: ${u.cartLink}`,

  // Day 7
  (u) => `🙏 Final reminder!\n\nThis is our last follow-up for *${u.cartNumberRaw || u.cartNumber}*.\n\n💰 ₹${u.cartPrice?.toLocaleString('en-IN') || '—'} · Limited availability\n\n👉 ${u.cartLink}\n\nWe hope to see you soon! — Team Numberwale`,
];

// ─── Main Job Function ─────────────────────────────────────────────────────────
async function runDripCron() {
  console.log(`[DripCron] 🕙 Starting drip run at ${new Date().toISOString()}`);

  let users;
  try {
    users = await getActiveDripUsers();
  } catch (err) {
    console.error('[DripCron] ❌ Failed to fetch users:', err.message);
    return;
  }

  console.log(`[DripCron] Found ${users.length} users to message.`);

  for (const user of users) {
    const nextDay = (user.dripDay || 0) + 1; // 1-indexed day to send

    if (nextDay > 7) {
      // Safety: deactivate if somehow still active
      await advanceDripDay(user.phone, 8);
      continue;
    }

    const msgFn = DRIP_MESSAGES[nextDay - 1]; // 0-indexed array
    const message = msgFn(user);

    try {
      await sendToGallabox(user.phone, message);
      await advanceDripDay(user.phone, nextDay);
      console.log(`[DripCron] ✅ Day ${nextDay} sent to ${user.phone}`);
    } catch (err) {
      console.error(`[DripCron] ❌ Failed for ${user.phone}:`, err.message);
      // Don't advance dripDay on failure — will retry next run
    }

    // Small delay between users to avoid Gallabox rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[DripCron] ✅ Run complete. Processed ${users.length} users.`);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
// "30 4 * * *" = 04:30 UTC = 10:00 AM IST every day
export function startDripCron() {
  cron.schedule('30 4 * * *', async () => {
    try {
      await runDripCron();
    } catch (err) {
      console.error('[DripCron] ❌ Unhandled error:', err);
    }
  }, {
    timezone: 'UTC'
  });

  console.log('[DripCron] 🟢 Drip cron scheduled — daily at 10:00 AM IST (04:30 UTC)');
}

// Allow manual trigger for testing: node -e "import('./api/cron/dripCron.js').then(m => m.runDripCron())"
export { runDripCron };
