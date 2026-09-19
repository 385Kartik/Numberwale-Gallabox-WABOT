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
 * Post an internal note to a Gallabox conversation.
 * Visible to executives under the "Notes" tab in Gallabox inbox.
 * @param {string} conversationId - Gallabox conversation ID
 * @param {string} note - Note text (supports markdown-like formatting)
 */
export async function postGallaboxNote(conversationId, note) {
  const { apiKey, apiSecret, accountId } = getCredentials();
  if (!apiKey || !apiSecret || !accountId || !conversationId || !note) return;

  try {
    await axios.post(
      `https://server.gallabox.com/devapi/accounts/${accountId}/conversations/${conversationId}/notes`,
      { note },
      {
        headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
    console.log(`[Gallabox] 📝 Internal note posted to conversation ${conversationId}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ Post note failed:', err.response?.data || err.message);
  }
}

// ── Known Gallabox Tag Registry ────────────────────────────────────────────────
// These IDs are permanent in the Numberwale Gallabox account.
const GALLABOX_TAGS = {
  BOT_ACTIVE:    { id: '6aa90a42c42c98fae151e2f9', name: 'BOT_ACTIVE' },
  REQUIRE_AGENT: { id: '6a33e4fcaf1d75f156499455', name: 'REQUIRE_AGENT' },
};

/**
 * Set a specific set of tags on a Gallabox contact (replaces all existing tags).
 * @param {string} phone - raw phone string e.g. "919619410050" or "9619410050"
 * @param {string[]} tagNames - array of tag names from GALLABOX_TAGS keys
 */
async function setGallaboxTags(phone, tagNames) {
  const { apiKey, apiSecret, accountId } = getCredentials();
  if (!apiKey || !apiSecret || !accountId || !phone) return;

  try {
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const formattedPhone = `+${cleanPhone}`;

    // Resolve tag objects — only known tags
    const tagObjects = tagNames.map(n => GALLABOX_TAGS[n]).filter(Boolean);

    // Get contact ID
    const getRes = await axios.get(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts?phone=${encodeURIComponent(formattedPhone)}`,
      { headers: { apiKey, apiSecret }, timeout: 6000 }
    );
    const contacts = getRes.data?.contacts || getRes.data || [];
    const contact = Array.isArray(contacts) && contacts.length > 0 ? contacts[0] : null;
    if (!contact || !contact.id) {
      console.warn(`[Gallabox] ⚠️ Contact not found for ${formattedPhone} — cannot set tags.`);
      return;
    }

    await axios.patch(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts/${contact.id}`,
      { tags: tagObjects },
      { headers: { apiKey, apiSecret, 'Content-Type': 'application/json' }, timeout: 6000 }
    );
    console.log(`[Gallabox] 🏷️ Tags set to [${tagNames.join(', ')}] for ${formattedPhone}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ setGallaboxTags failed:', err.response?.data || err.message);
  }
}

/**
 * Add a tag to a Gallabox contact (preserves existing tags).
 * @param {string} phone - raw phone string
 * @param {string} tagName - tag name key from GALLABOX_TAGS (e.g. "BOT_ACTIVE")
 */
export async function addGallaboxTag(phone, tagName) {
  const { apiKey, apiSecret, accountId } = getCredentials();
  if (!apiKey || !apiSecret || !accountId || !phone || !tagName) return;

  const tagObj = GALLABOX_TAGS[tagName];
  if (!tagObj) {
    console.warn(`[Gallabox] ⚠️ Unknown tag '${tagName}' — not in registry.`);
    return;
  }

  try {
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const formattedPhone = `+${cleanPhone}`;

    // Get contact + existing tags
    const getRes = await axios.get(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts?phone=${encodeURIComponent(formattedPhone)}`,
      { headers: { apiKey, apiSecret }, timeout: 6000 }
    );
    const contacts = getRes.data?.contacts || getRes.data || [];
    const contact = Array.isArray(contacts) && contacts.length > 0 ? contacts[0] : null;
    if (!contact || !contact.id) {
      console.warn(`[Gallabox] ⚠️ Contact not found for ${formattedPhone} — cannot add tag '${tagName}'.`);
      return;
    }

    const existingTags = Array.isArray(contact.tags) ? contact.tags : [];
    if (existingTags.some(t => t.id === tagObj.id || t.name === tagName)) {
      console.log(`[Gallabox] 🏷️ Tag '${tagName}' already on ${formattedPhone}. No-op.`);
      return;
    }

    // Rebuild tags list with both id+name for all (Gallabox requires both)
    const resolvedExisting = existingTags
      .map(t => GALLABOX_TAGS[t.name] || (t.id && t.name ? { id: t.id, name: t.name } : null))
      .filter(Boolean);

    const newTags = [...resolvedExisting, tagObj];
    await axios.patch(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts/${contact.id}`,
      { tags: newTags },
      { headers: { apiKey, apiSecret, 'Content-Type': 'application/json' }, timeout: 6000 }
    );
    console.log(`[Gallabox] 🏷️ Tag '${tagName}' added to ${formattedPhone}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ addGallaboxTag failed:', err.response?.data || err.message);
  }
}

/**
 * Remove a tag from a Gallabox contact.
 * @param {string} phone - raw phone string
 * @param {string} tagName - tag name key from GALLABOX_TAGS (e.g. "BOT_ACTIVE")
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
      { headers: { apiKey, apiSecret }, timeout: 6000 }
    );
    const contacts = getRes.data?.contacts || getRes.data || [];
    const contact = Array.isArray(contacts) && contacts.length > 0 ? contacts[0] : null;
    if (!contact || !contact.id) return;

    const existingTags = Array.isArray(contact.tags) ? contact.tags : [];
    const filtered = existingTags.filter(t => t.name !== tagName);
    if (filtered.length === existingTags.length) {
      console.log(`[Gallabox] 🏷️ Tag '${tagName}' not present on ${formattedPhone}. No-op.`);
      return;
    }

    // Rebuild with both id+name for all remaining tags
    const resolvedFiltered = filtered
      .map(t => GALLABOX_TAGS[t.name] || (t.id && t.name ? { id: t.id, name: t.name } : null))
      .filter(Boolean);

    await axios.patch(
      `https://server.gallabox.com/devapi/accounts/${accountId}/contacts/${contact.id}`,
      { tags: resolvedFiltered },
      { headers: { apiKey, apiSecret, 'Content-Type': 'application/json' }, timeout: 6000 }
    );
    console.log(`[Gallabox] 🏷️ Tag '${tagName}' removed from ${formattedPhone}.`);
  } catch (err) {
    console.error('[Gallabox] ❌ removeGallaboxTag failed:', err.response?.data || err.message);
  }
}

/**
 * Send a WhatsApp PDF/document message via Gallabox.
 * @param {string} phone - E.164 format e.g. "919619410050"
 * @param {string} documentUrl - Publicly accessible URL to the PDF/document
 * @param {string} filename - Filename for the document e.g. "Invoice-NW-1001.pdf"
 * @param {string} [caption] - Optional document caption
 * @param {string} [channelId] - Gallabox channel ID
 */
export async function sendGallaboxDocument(phone, documentUrl, filename, caption = '', channelId) {
  const globalConfig = await getGlobalBotConfig().catch(() => null);
  if (globalConfig && (!globalConfig.isGlobalEnabled || globalConfig.botMode === 'OFF')) {
    console.log(`[Gallabox] 🔴 Bot is GLOBALLY PAUSED via Admin CRM. Blocked sending document to ${phone}.`);
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
      console.log(`[Gallabox] 🔒 Whitelist active. Blocked sending document to non-whitelisted: ${phone}`);
      return;
    }
  }

  const { apiKey, apiSecret, channelId: defaultChannelId } = getCredentials();
  const chId = channelId || defaultChannelId;

  if (!apiKey || !apiSecret || !chId || !phone || !documentUrl) {
    console.log('[Gallabox] ⚠️ Missing credentials, phone or documentUrl — skipping document send.');
    return;
  }

  const botLocalMsgId = randomUUID();
  storeBotMessageId(phone, botLocalMsgId).catch(e =>
    console.error('[Gallabox] storeBotMessageId failed:', e.message)
  );

  const safeFilename = String(filename || 'document.pdf').replace(/[\/\\]/g, '-');

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
          whatsapp: {
            type: 'document',
            document: {
              link: documentUrl,
              filename: safeFilename,
              caption: caption || ''
            }
          },
        },
        {
          headers: { apiKey, apiSecret, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
      console.log(`[Gallabox] 📄 Document (${safeFilename}) sent to ${phone} in ${Date.now() - t0Send}ms (msgId: ${botLocalMsgId})`);
      return;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('[Gallabox] ❌ Send document failed:', err.response?.data || err.message);
        return;
      }
      console.log(`[Gallabox] ⚠️ Retrying document send... (${retries} left)`);
      await new Promise(r => setTimeout(r, 600));
    }
  }
}


