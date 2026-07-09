/**
 * Shared Gallabox API utilities.
 * Used by webhook.js, cart-webhook.js, and dripCron.js.
 */
import { storeBotMessageId } from './analytics.js';
import { randomUUID } from 'crypto';
import axios from 'axios';

function getCredentials() {
  return {
    apiKey:    process.env.GALLABOX_API_KEY,
    apiSecret: process.env.GALLABOX_API_SECRET,
    accountId: process.env.GALLABOX_ACCOUNT_ID,
    channelId: process.env.GALLABOX_CHANNEL_ID,
  };
}

/**
 * Send a WhatsApp text message via Gallabox.
 * Generates a UUID localMessageId to detect echo webhooks.
 * @param {string} phone  - E.164 format e.g. "919619410050"
 * @param {string} text   - Message body
 * @param {string} [channelId] - Gallabox channel ID (falls back to GALLABOX_CHANNEL_ID env var)
 */
export async function sendToGallabox(phone, text, channelId) {
  const { apiKey, apiSecret, channelId: defaultChannelId } = getCredentials();
  const chId = channelId || defaultChannelId;

  if (!apiKey || !apiSecret || !chId || !phone) {
    console.log('[Gallabox] ⚠️ Missing credentials or phone — skipping send.');
    return;
  }

  const botLocalMsgId = randomUUID();

  // Store non-blocking so echo can be matched (echo arrives after HTTP response)
  storeBotMessageId(phone, botLocalMsgId).catch(e =>
    console.error('[Gallabox] storeBotMessageId failed:', e.message)
  );

  let retries = 3;
  while (retries > 0) {
    try {
      await axios.post(
        'https://server.gallabox.com/devapi/messages/whatsapp',
        {
          channelId: chId,
          localMessageId: botLocalMsgId,
          channelType: 'whatsapp',
          recipient: { name: phone, phone },
          whatsapp: { type: 'text', text: { body: text } },
        },
        {
          headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
          timeout: 8000,
        }
      );
      console.log(`[Gallabox] ✉️  Sent to ${phone} (msgId: ${botLocalMsgId})`);
      return;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('[Gallabox] ❌ Send failed:', err.response?.data || err.message);
        return;
      }
      console.log(`[Gallabox] ⚠️ Retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

/**
 * Unassign a Gallabox conversation (called on agent timeout).
 * @param {string} conversationId - Gallabox conversation ID
 */
export async function unassignConversation(conversationId) {
  const { apiKey, apiSecret, accountId } = getCredentials();
  if (!apiKey || !apiSecret || !accountId || !conversationId) {
    console.log('[Gallabox] ⚠️ Cannot unassign — missing credentials or conversationId.');
    return;
  }
  try {
    await axios.post(
      `https://server.gallabox.com/devapi/accounts/${accountId}/conversations/${conversationId}/assign`,
      { assignedTo: null },
      {
        headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
    console.log(`[Gallabox] 🔓 Conversation ${conversationId} unassigned.`);
  } catch (err) {
    console.error('[Gallabox] ❌ Unassign failed:', err.response?.data || err.message);
  }
}

/**
 * Add a tag to a Gallabox contact.
 */
export async function addGallaboxTag(phone, tagName) {
  const { apiKey, apiSecret } = getCredentials();
  if (!apiKey || !apiSecret) return;
  try {
    await axios.post(
      'https://server.gallabox.com/devapi/contacts/tags',
      { phone, tags: [tagName] },
      {
        headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
    console.log(`[Gallabox] 🏷️ Tag '${tagName}' added to ${phone}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ Tag failed:', err.response?.data || err.message);
  }
}
