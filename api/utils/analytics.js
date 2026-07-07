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
  language: { type: String, default: null }
}, { timestamps: true });

// Use existing models to avoid OverwriteModelError on hot reloads
const DailyStats = mongoose.models.BotDailyStats || mongoose.model('BotDailyStats', DailyStatsSchema);
const CustomerProfile = mongoose.models.CustomerBotProfile || mongoose.model('CustomerBotProfile', CustomerBotProfileSchema);

// ─── Helper: Today's date string ─────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
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

    return {
      activeFilters: profile.activeFilters || {},
      lastPage: profile.lastPage || 1,
      botState: profile.botState || 'NEW',
      name: profile.name,
      pinCode: profile.pinCode,
      language: profile.language || null
    };
  } catch (err) {
    console.error('[Analytics] getCustomerContext error:', err.message);
    return { activeFilters: {}, lastPage: 1, botState: 'NEW', language: null };
  }
}

/**
 * Update the customer's onboarding state, name, and pincode
 */
export async function updateCustomerInfo(phone, updates) {
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
 * Clear the active filters but keep name, pincode, and state intact
 */
export async function resetActiveFilters(phone) {
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
export async function logInteraction({ phone, name, userText, botText, isFail = false, model = null, tokensUsed = 0, jsonQuery = null, page = 1 }) {
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

    // 2. Update Customer Profile
    const historyEntries = [
      { role: 'user', text: userText, isFail, tokensUsed: 0 },
      { role: 'bot', text: botText, isFail: false, tokensUsed } // Associate tokens with bot reply
    ];

    const incCustomer = isFail ? { failureCount: 1 } : { successCount: 1 };

    // Build $set — always update name; also save activeFilters + lastPage on success
    const setFields = { name };
    if (!isFail && jsonQuery && Object.keys(jsonQuery).length > 0) {
      setFields.activeFilters = jsonQuery;
      setFields.lastPage = page;
    }

    await CustomerProfile.findOneAndUpdate(
      { phone },
      { 
        $set: setFields,
        $inc: incCustomer,
        $push: { history: { $each: historyEntries, $slice: -20 } }
      },
      { upsert: true }
    );

  } catch (err) {
    console.error('[Analytics] logInteraction failed:', err.message);
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
