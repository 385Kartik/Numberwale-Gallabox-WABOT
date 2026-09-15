/**
 * Shared Gallabox API utilities.
 * Used by webhook.js, cart-webhook.js, and dripCron.js.
 */
import { storeBotMessageId, getGlobalBotConfig } from './analytics.js';
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
  const globalConfig = await getGlobalBotConfig().catch(() => null);
  if (globalConfig && (!globalConfig.isGlobalEnabled || globalConfig.botMode === 'OFF')) {
    console.log(`[Gallabox] 🔴 Bot is GLOBALLY PAUSED via Admin CRM. Blocked sending to ${phone}.`);
    return;
  }

  let isWhitelistActive = false;
  let allowedList = [];

  if (process.env.ALLOWED_PHONES) {
    isWhitelistActive = true;
    allowedList.push(...process.env.ALLOWED_PHONES.split(',').map(p => p.trim().replace(/\D/g, '')));
  }

  if (globalConfig?.isWhitelistOnly && Array.isArray(globalConfig?.whitelistPhones) && globalConfig.whitelistPhones.length > 0) {
    isWhitelistActive = true;
    allowedList.push(...globalConfig.whitelistPhones.map(p => p.trim().replace(/\D/g, '')));
  }

  if (isWhitelistActive) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!allowedList.includes(cleanPhone)) {
      console.log(`[Gallabox] 🔒 Whitelist active. Blocked sending to non-whitelisted: ${phone}`);
      return;
    }
  }

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

  const cleanBody = (text || '')
    .replace(/(?:<think>[\s\S]*?<\/think>|<think>[\s\S]*$)/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();

  if (!cleanBody) {
    console.warn(`[Gallabox] ⚠️ Empty message text for ${phone} after think check — skipping send.`);
    return;
  }

  let retries = 3;
  const t0Send = Date.now();
  while (retries > 0) {
    try {
      await axios.post(
        'https://server.gallabox.com/devapi/messages/whatsapp',
        {
          channelId: chId,
          localMessageId: botLocalMsgId,
          channelType: 'whatsapp',
          recipient: { name: phone, phone },
          whatsapp: { type: 'text', text: { body: cleanBody } },
        },
        {
          headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
          timeout: 8000,
        }
      );
      console.log(`[Gallabox] ✉️  Sent to ${phone} in ${Date.now() - t0Send}ms (msgId: ${botLocalMsgId})`);
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
 * Add a tag to a Gallabox contact via upsert API.
 * @param {string} phone - E.164 phone string
 * @param {string} tagName - Tag name (e.g. "BOT_ACTIVE", "REQUIRE_AGENT")
 */
export async function addGallaboxTag(phone, tagName) {
  const { apiKey, apiSecret } = getCredentials();
  if (!apiKey || !apiSecret || !phone || !tagName) return;

  try {
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const formattedPhone = `+${cleanPhone}`;

    await axios.post(
      'https://server.gallabox.com/devapi/contacts/upsert',
      {
        phone: [formattedPhone],
        tags: [{ name: tagName }]
      },
      {
        headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
        timeout: 6000,
      }
    );
    console.log(`[Gallabox] 🏷️ Tag '${tagName}' successfully synced to ${formattedPhone}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ Tag failed:', err.response?.data || err.message);
  }
}

/**
 * Remove a tag from a Gallabox contact.
 * @param {string} phone - E.164 phone string
 * @param {string} tagName - Tag name to remove (e.g. "BOT_ACTIVE")
 */
export async function removeGallaboxTag(phone, tagName) {
  const { apiKey, apiSecret, accountId } = getCredentials();
  if (!apiKey || !apiSecret || !accountId || !phone || !tagName) return;

  try {
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const formattedPhone = `+${cleanPhone}`;

    const getRes = await axios.get(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts?phone=${encodeURIComponent(formattedPhone)}`,
      { headers: { apiKey, apiSecret } }
    );
    const contacts = getRes.data?.contacts || getRes.data || [];
    const contact = Array.isArray(contacts) && contacts.length > 0 ? contacts[0] : null;

    if (contact && contact.id && Array.isArray(contact.tags)) {
      const remainingTags = contact.tags.filter(t => t.name !== tagName);
      if (remainingTags.length !== contact.tags.length) {
        await axios.patch(
          `https://server.gallabox.com/devapi/accounts/${accountId}/contacts/${contact.id}`,
          { tags: remainingTags },
          { headers: { apiKey, apiSecret, 'Content-Type': 'application/json' } }
        );
        console.log(`[Gallabox] 🏷️ Tag '${tagName}' removed from ${formattedPhone}.`);
      }
    }
  } catch (err) {
    console.error('[Gallabox] ❌ Remove tag failed:', err.response?.data || err.message);
  }
}

