/**
 * Simple in-memory session store per phone number.
 * Stores the last search query + current page for "show more" support.
 * 
 * Note: This works on Vercel warm instances. On cold starts, sessions reset.
 * For production-level persistence, replace with Vercel KV / Redis.
 */

const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Set of phone numbers where bot is paused (human agent took over)
const pausedPhones = new Set();

export function saveSession(phone, data) {
  sessions.set(phone, {
    ...data,
    updatedAt: Date.now()
  });
}

export function getSession(phone) {
  const session = sessions.get(phone);
  if (!session) return null;

  // Expire session after TTL
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(phone);
    return null;
  }

  return session;
}

export function clearSession(phone) {
  sessions.delete(phone);
}

/**
 * Pause the bot for a specific phone number.
 * Call this when an employee takes over the conversation.
 */
export function pauseBot(phone) {
  pausedPhones.add(phone);
  clearSession(phone); // Also clear their search session
  console.log(`[Session] Bot PAUSED for ${phone}`);
}

/**
 * Resume the bot for a specific phone number.
 * Call this when employee is done and wants bot to handle again.
 */
export function resumeBot(phone) {
  pausedPhones.delete(phone);
  console.log(`[Session] Bot RESUMED for ${phone}`);
}

/**
 * Returns true if bot is paused for this phone (human agent handling).
 */
export function isBotPaused(phone) {
  return pausedPhones.has(phone);
}

/**
 * Check if the user's message is a "show more" intent.
 */
export function isShowMoreIntent(message) {
  if (!message) return false;
  const lower = message.toLowerCase().trim();
  const showMorePatterns = [
    'show more', 'more', 'next', 'aur dikhao', 'aur', 'next page',
    'more numbers', 'aur numbers', 'and more', 'show next',
    'aage', 'aage dikhao', 'more please', 'and next', '2', 'page 2'
  ];
  return showMorePatterns.some(p => lower === p || lower.startsWith(p + ' '));
}
