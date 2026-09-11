import mongoose from 'mongoose';

// ─── MongoDB Connection (singleton) ───────────────────────────────────────────
async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined in environment variables.');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('[Analytics] MongoDB connected');
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

// One document per calendar day — upserted on every request (For Charts)
const DailyStatsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  totalSearches: { type: Number, default: 0 },
  successfulReplies: { type: Number, default: 0 },
  failedParses: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  tokensByModel: { type: Map, of: Number, default: {} },
}, { timestamps: true });

// One document per customer (Unified Logging)
const CustomerBotProfileSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: 'Unknown' },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  history: [{
    role: { type: String, enum: ['user', 'bot'], required: true },
    text: { type: String, required: true },
    isFail: { type: Boolean, default: false },
    tokensUsed: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
  }],
  activeFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastPage: { type: Number, default: 1 },
  botState: { type: String, enum: ['NEW', 'AWAITING_LANGUAGE', 'AWAITING_INFO', 'ACTIVE', 'PAUSED'], default: 'NEW' },
  pinCode: { type: String },
  name: { type: String },
  language: { type: String, default: null },
  dob: { type: String, default: null },
  birthNumber: { type: Number, default: null },
  lifePathNumber: { type: Number, default: null },
  agentReplied: { type: Boolean, default: false },
  lastAgentReplyAt: { type: Date, default: null },
  pendingBotMessages: [{ type: String }],  // localMessageIds sent by bot (to filter echoes)
  conversationId: { type: String, default: null }, // Gallabox conversationId for assign/unassign

  // ── Drip Campaign (cart abandonment only) ──
  dripActive:    { type: Boolean, default: false },
  dripDay:       { type: Number, default: 0 },      // 0 = not started, 1-7 = current day sent
  dripStartedAt: { type: Date, default: null },
  cartNumber:    { type: String, default: null },   // VIP number they added to cart
  cartNumberRaw: { type: String, default: null },   // formatted number for display
  cartPrice:     { type: Number, default: null },   // price at cart time
  cartLink:      { type: String, default: null },   // checkout URL
  cartName:      { type: String, default: null },   // user's name from website
  lastInteractionAt: { type: Date, default: null }, // last time user messaged the bot
}, { timestamps: true });

// Customer bot profiles are permanently retained (history capped via $slice: -10)

// Use existing models to avoid OverwriteModelError on hot reloads
const DailyStats = mongoose.models.BotDailyStats || mongoose.model('BotDailyStats', DailyStatsSchema);
const CustomerProfile = mongoose.models.CustomerBotProfile || mongoose.model('CustomerBotProfile', CustomerBotProfileSchema);

// ─── Helper: Today's date string ─────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── In-Memory Fallback Cache (resilience against DB timeouts / local dev) ────
const memoryStore = new Map();

function getMemoryProfile(phone) {
  if (!memoryStore.has(phone)) {
    memoryStore.set(phone, {
      phone,
      activeFilters: {},
      lastPage: 1,
      botState: 'NEW',
      name: 'Unknown',
      pinCode: null,
      language: null,
      dob: null,
      birthNumber: null,
      lifePathNumber: null,
      agentReplied: false,
      pendingBotMessages: [],
      history: []
    });
  }
  return memoryStore.get(phone);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the user's active filters and last page (for context)
 */
export async function getCustomerContext(phone, name) {
  try {
    await connectDB();

    const profile = await CustomerProfile.findOneAndUpdate(
      { phone },
      { $setOnInsert: { name, phone, successCount: 0, failureCount: 0, history: [], activeFilters: {}, lastPage: 1 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const data = {
      activeFilters: profile.activeFilters || {},
      lastPage: profile.lastPage || 1,
      botState: profile.botState || 'NEW',
      name: profile.name,
      pinCode: profile.pinCode,
      language: profile.language || null,
      dob: profile.dob || null,
      birthNumber: profile.birthNumber != null ? profile.birthNumber : null,
      lifePathNumber: profile.lifePathNumber != null ? profile.lifePathNumber : null,
      agentReplied: profile.agentReplied || false,
      lastAgentReplyAt: profile.lastAgentReplyAt || null,
      history: (profile.history || []).slice(-6)
    };
    const mem = getMemoryProfile(phone);
    Object.assign(mem, data);
    return data;
  } catch (err) {
    console.error('[Analytics] getCustomerContext error:', err.message);
    const mem = getMemoryProfile(phone);
    if (name && (!mem.name || mem.name === 'Unknown')) mem.name = name;
    return {
      activeFilters: mem.activeFilters || {},
      lastPage: mem.lastPage || 1,
      botState: mem.botState || 'NEW',
      name: mem.name,
      pinCode: mem.pinCode,
      language: mem.language || null,
      dob: mem.dob || null,
      birthNumber: mem.birthNumber != null ? mem.birthNumber : null,
      lifePathNumber: mem.lifePathNumber != null ? mem.lifePathNumber : null,
      agentReplied: mem.agentReplied || false,
      lastAgentReplyAt: mem.lastAgentReplyAt || null,
      history: (mem.history || []).slice(-6)
    };
  }
}

/**
 * Update the customer's onboarding state, name, and pincode
 */
export async function updateCustomerInfo(phone, updates) {
  const mem = getMemoryProfile(phone);
  Object.assign(mem, updates);
  try {
    await connectDB();
    await CustomerProfile.findOneAndUpdate(
      { phone },
      { $set: updates },
      { upsert: true }
    );
  } catch (err) {
    console.error('[Analytics] updateCustomerInfo error:', err.message);
  }
}

/**
 * Store a localMessageId sent by the Vercel bot (to detect echo webhooks from Gallabox).
 */
export async function storeBotMessageId(phone, messageId) {
  const mem = getMemoryProfile(phone);
  if (!mem.pendingBotMessages) mem.pendingBotMessages = [];
  mem.pendingBotMessages.push(messageId);
  try {
    await connectDB();
    await CustomerProfile.updateOne(
      { phone },
      { $addToSet: { pendingBotMessages: messageId } },
      { upsert: true }
    );
  } catch (err) {
    console.error('[Analytics] storeBotMessageId error:', err.message);
  }
}

/**
 * Check if a given localMessageId was sent by the Vercel bot.
 * If found, removes it from the list (consume once).
 */
export async function isBotMessageId(phone, messageId) {
  if (!phone || !messageId) return false;
  const mem = getMemoryProfile(phone);
  let foundInMem = false;
  if (mem.pendingBotMessages && mem.pendingBotMessages.includes(messageId)) {
    mem.pendingBotMessages = mem.pendingBotMessages.filter(id => id !== messageId);
    foundInMem = true;
  }
  try {
    await connectDB();
    const result = await CustomerProfile.findOneAndUpdate(
      { phone, pendingBotMessages: messageId },
      { $pull: { pendingBotMessages: messageId } },
      { returnDocument: 'before' }
    );
    return !!result || foundInMem;
  } catch (err) {
    console.error('[Analytics] isBotMessageId error:', err.message);
    return foundInMem;
  }
}

/**
 * Clear the active filters but keep name, pincode, and state intact
 */
export async function resetActiveFilters(phone) {
  const mem = getMemoryProfile(phone);
  mem.activeFilters = {};
  mem.lastPage = 1;
  try {
    await connectDB();
    await CustomerProfile.findOneAndUpdate(
      { phone },
      { $set: { activeFilters: {}, lastPage: 1 } }
    );
  } catch (err) {
    console.error('[Analytics] resetActiveFilters error:', err.message);
  }
}

/**
 * Log a single interaction cycle (User Msg -> Bot Reply)
 */
export async function logInteraction({ phone, name, userText, botText, isFail = false, model = null, tokensUsed = 0, jsonQuery = null, page = 1, dob = null, birthNumber = null, lifePathNumber = null }) {
  try {
    await connectDB();
    const date = todayStr();

    // 1. Update Daily Stats
    const incDaily = {
      totalSearches: 1,
      totalTokens: tokensUsed,
    };
    if (isFail) incDaily.failedParses = 1;
    else incDaily.successfulReplies = 1;
    if (model) incDaily[`tokensByModel.${model}`] = tokensUsed;

    await DailyStats.findOneAndUpdate(
      { date },
      { $inc: incDaily },
      { upsert: true }
    );

    // 2. Update Customer Profile (Capped to last 10 messages & max text length to keep DB feather-light)
    const historyEntries = [
      { role: 'user', text: String(userText || '').substring(0, 300), isFail, tokensUsed: 0 },
      { role: 'bot', text: String(botText || '').substring(0, 500), isFail: false, tokensUsed }
    ];

    const mem = getMemoryProfile(phone);
    if (!mem.history) mem.history = [];
    mem.history.push(...historyEntries);
    if (mem.history.length > 10) mem.history = mem.history.slice(-10);
    if (dob) mem.dob = dob;
    if (birthNumber != null) mem.birthNumber = birthNumber;
    if (lifePathNumber != null) mem.lifePathNumber = lifePathNumber;

    const incCustomer = isFail ? { failureCount: 1 } : { successCount: 1 };

    // Build $set — always update name; also save activeFilters + lastPage on success
    const setFields = { name };
    if (!isFail && jsonQuery && Object.keys(jsonQuery).length > 0) {
      setFields.activeFilters = jsonQuery;
      setFields.lastPage = page;
    }
    if (dob) setFields.dob = dob;
    if (birthNumber != null) setFields.birthNumber = birthNumber;
    if (lifePathNumber != null) setFields.lifePathNumber = lifePathNumber;

    await CustomerProfile.findOneAndUpdate(
      { phone },
      { 
        $set: setFields,
        $inc: incCustomer,
        $push: { history: { $each: historyEntries, $slice: -10 } }
      },
      { upsert: true }
    );

  } catch (err) {
    console.error('[Analytics] logInteraction failed:', err.message);
    const mem = getMemoryProfile(phone);
    if (!mem.history) mem.history = [];
    mem.history.push(
      { role: 'user', text: String(userText || '').substring(0, 300), isFail, tokensUsed: 0 },
      { role: 'bot', text: String(botText || '').substring(0, 500), isFail: false, tokensUsed }
    );
    if (mem.history.length > 10) mem.history = mem.history.slice(-10);
  }
}

/**
 * Fetch analytics data for the admin dashboard.
 * Adapted to pull from CustomerProfile.history instead of old logs.
 */
export async function getAnalytics(days = 30) {
  await connectDB();

  // Date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().slice(0, 10);

  // 1. Daily stats
  const dailyStats = await DailyStats.find(
    { date: { $gte: startStr } },
    { _id: 0, date: 1, totalSearches: 1, successfulReplies: 1, failedParses: 1, totalTokens: 1, tokensByModel: 1 }
  ).sort({ date: 1 }).lean();

  // 2. Top queries (unwind history)
  const topSearches = await CustomerProfile.aggregate([
    { $unwind: "$history" },
    { $match: { "history.role": "user", "history.isFail": false, "history.timestamp": { $gte: startDate } } },
    { $group: { _id: "$history.text", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
    { $project: { query: "$_id", count: 1, _id: 0 } }
  ]);

  // 3. Token usage by model (using DailyStats map)
  let tokensByModel = [];
  const modelMap = {};
  dailyStats.forEach(stat => {
    if (stat.tokensByModel) {
      for (const [model, tokens] of Object.entries(stat.tokensByModel)) {
        modelMap[model] = (modelMap[model] || 0) + tokens;
      }
    }
  });
  for (const [model, totalTokens] of Object.entries(modelMap)) {
    tokensByModel.push({ model, totalTokens, count: 1 }); // count not accurate here but UI just needs totalTokens
  }
  tokensByModel.sort((a, b) => b.totalTokens - a.totalTokens);

  // 4. Recent failed parses
  const failedParsesAgg = await CustomerProfile.aggregate([
    { $unwind: "$history" },
    { $match: { "history.role": "user", "history.isFail": true, "history.timestamp": { $gte: startDate } } },
    { $sort: { "history.timestamp": -1 } },
    { $limit: 50 },
    { $project: { rawQuery: "$history.text", errorMessage: "AI Failed or Unrelated", timestamp: "$history.timestamp", date: { $dateToString: { format: "%Y-%m-%d", date: "$history.timestamp" } }, _id: 0 } }
  ]);
  const failedParses = failedParsesAgg;

  // 5. Today summary
  const todayStats = dailyStats.find(s => s.date === todayStr()) || {
    totalSearches: 0, successfulReplies: 0, failedParses: 0, totalTokens: 0
  };

  return { dailyStats, topSearches, tokensByModel, failedParses, todayStats };
}

// ─── Drip Campaign Functions ───────────────────────────────────────────────────

/**
 * Start the cart drip campaign for a user.
 * Called when website sends cart-webhook event.
 */
export async function startCartDrip(phone, { name, cartNumber, cartNumberRaw, cartPrice, cartLink }) {
  try {
    await connectDB();
    await CustomerProfile.findOneAndUpdate(
      { phone },
      {
        $set: {
          dripActive: true,
          dripDay: 0,
          dripStartedAt: new Date(),
          cartNumber, cartNumberRaw, cartPrice, cartLink,
          cartName: name || null,
          // Only set name if we don't have one yet
        },
        $setOnInsert: { phone, successCount: 0, failureCount: 0, history: [], activeFilters: {}, lastPage: 1 }
      },
      { upsert: true }
    );
    console.log(`[Analytics] Drip started for ${phone} — cart: ${cartNumber}`);
  } catch (err) {
    console.error('[Analytics] startCartDrip error:', err.message);
  }
}

/**
 * Stop the drip campaign (user purchased).
 */
export async function stopDrip(phone) {
  try {
    await connectDB();
    await CustomerProfile.updateOne(
      { phone },
      { $set: { dripActive: false, dripDay: 0 } }
    );
    console.log(`[Analytics] Drip stopped for ${phone} (purchase).`);
  } catch (err) {
    console.error('[Analytics] stopDrip error:', err.message);
  }
}

/**
 * Save Gallabox conversationId (needed to unassign agent on timeout).
 */
export async function saveConversationId(phone, conversationId) {
  if (!phone || !conversationId) return;
  try {
    await connectDB();
    await CustomerProfile.updateOne({ phone }, { $set: { conversationId } }, { upsert: true });
  } catch (err) {
    console.error('[Analytics] saveConversationId error:', err.message);
  }
}

/**
 * Update lastInteractionAt (call on every inbound customer message).
 */
export async function touchInteraction(phone) {
  try {
    await connectDB();
    await CustomerProfile.updateOne(
      { phone },
      { $set: { lastInteractionAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error('[Analytics] touchInteraction error:', err.message);
  }
}

/**
 * Get all users with active drip campaigns.
 * Used by the daily cron job.
 * Excludes users who are in PAUSED state (agent handling) or
 * were active with the bot in the last 6 hours.
 */
export async function getActiveDripUsers() {
  try {
    await connectDB();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    return await CustomerProfile.find({
      dripActive: true,
      dripDay: { $lt: 7 },
      botState: { $ne: 'PAUSED' },                        // skip agent-handled
      $or: [
        { lastInteractionAt: null },                       // never interacted with bot
        { lastInteractionAt: { $lt: sixHoursAgo } }       // or not active in last 6h
      ]
    }).lean();
  } catch (err) {
    console.error('[Analytics] getActiveDripUsers error:', err.message);
    return [];
  }
}

/**
 * Increment dripDay after sending. If day = 7, deactivate drip.
 */
export async function advanceDripDay(phone, nextDay) {
  try {
    await connectDB();
    const update = nextDay > 7
      ? { $set: { dripActive: false, dripDay: 7 } }
      : { $set: { dripDay: nextDay } };
    await CustomerProfile.updateOne({ phone }, update);
  } catch (err) {
    console.error('[Analytics] advanceDripDay error:', err.message);
  }
}

// ─── Global Bot Configuration (Persistent State) ──────────────────────────────
const GlobalBotConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global_bot_config', unique: true },
  isGlobalEnabled: { type: Boolean, default: true },
  botMode: { type: String, enum: ['FULL', 'CATALOG_ONLY', 'OFF'], default: 'FULL' },
  isWhitelistOnly: { type: Boolean, default: false },
  whitelistPhones: [{ type: String }],
  disabledReason: { type: String, default: '' },
  disabledAt: { type: Date, default: null },
  updatedBy: { type: String, default: 'system' }
}, { timestamps: true });

const GlobalBotConfig = mongoose.models.GlobalBotConfig || mongoose.model('GlobalBotConfig', GlobalBotConfigSchema);

let cachedGlobalConfig = null;
let globalConfigExpiry = 0;

export async function getGlobalBotConfig() {
  const now = Date.now();
  if (cachedGlobalConfig && now < globalConfigExpiry) {
    return cachedGlobalConfig;
  }
  try {
    await connectDB();
    let doc = await GlobalBotConfig.findOne({ key: 'global_bot_config' }).lean();
    if (!doc) {
      const envAllowed = process.env.ALLOWED_PHONES
        ? process.env.ALLOWED_PHONES.split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean)
        : [];
      doc = await GlobalBotConfig.create({
        key: 'global_bot_config',
        isGlobalEnabled: true,
        botMode: 'FULL',
        isWhitelistOnly: envAllowed.length > 0,
        whitelistPhones: envAllowed,
        updatedBy: 'initial_setup'
      });
      doc = doc.toObject ? doc.toObject() : doc;
    }
    cachedGlobalConfig = doc;
    globalConfigExpiry = now + 10000; // 10-second cache
    return doc;
  } catch (err) {
    console.error('[Analytics] getGlobalBotConfig error:', err.message);
    const envAllowed = process.env.ALLOWED_PHONES
      ? process.env.ALLOWED_PHONES.split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean)
      : [];
    return cachedGlobalConfig || {
      key: 'global_bot_config',
      isGlobalEnabled: true,
      botMode: 'FULL',
      isWhitelistOnly: envAllowed.length > 0,
      whitelistPhones: envAllowed,
      disabledReason: '',
      updatedBy: 'fallback'
    };
  }
}

export async function updateGlobalBotConfig(updates, updatedBy = 'admin') {
  try {
    await connectDB();
    const doc = await GlobalBotConfig.findOneAndUpdate(
      { key: 'global_bot_config' },
      { $set: { ...updates, updatedBy, updatedAt: new Date() } },
      { new: true, upsert: true }
    ).lean();
    cachedGlobalConfig = doc;
    globalConfigExpiry = Date.now() + 10000;
    return doc;
  } catch (err) {
    console.error('[Analytics] updateGlobalBotConfig error:', err.message);
    throw err;
  }
}

export async function getRecentCustomerChats(limit = 25) {
  try {
    await connectDB();
    return await CustomerProfile.find({})
      .sort({ updatedAt: -1, lastInteractionAt: -1 })
      .limit(limit)
      .select('phone name botState agentReplied lastAgentReplyAt lastInteractionAt activeFilters updatedAt history')
      .lean();
  } catch (err) {
    console.error('[Analytics] getRecentCustomerChats error:', err.message);
    return [];
  }
}
