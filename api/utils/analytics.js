import mongoose from 'mongoose';

// ─── MongoDB Connection (singleton) ───────────────────────────────────────────
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined in environment variables.');
  await mongoose.connect(uri);
  isConnected = true;
  console.log('[Analytics] MongoDB connected');
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

// One document per calendar day — upserted on every request
const DailyStatsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  totalSearches: { type: Number, default: 0 },
  successfulReplies: { type: Number, default: 0 },
  failedParses: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  tokensByModel: { type: Map, of: Number, default: {} },
}, { timestamps: true });

// One document per search — used to compute top searches per day
const SearchLogSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },       // "YYYY-MM-DD"
  rawQuery: { type: String, required: true },
  parsedJson: { type: mongoose.Schema.Types.Mixed, default: null },
  model: { type: String, default: null },
  tokensUsed: { type: Number, default: 0 },
  success: { type: Boolean, default: true },
  timestamp: { type: Date, default: Date.now },
});

// One document per failed parse — for error log table
const FailedParseSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  rawQuery: { type: String, required: true },
  errorMessage: { type: String, default: 'Unknown error' },
  timestamp: { type: Date, default: Date.now },
});

// Use existing models to avoid OverwriteModelError on hot reloads
const DailyStats = mongoose.models.BotDailyStats || mongoose.model('BotDailyStats', DailyStatsSchema);
const SearchLog  = mongoose.models.BotSearchLog  || mongoose.model('BotSearchLog', SearchLogSchema);
const FailedParse = mongoose.models.BotFailedParse || mongoose.model('BotFailedParse', FailedParseSchema);

// ─── Helper: Today's date string ─────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a successful search.
 * @param {object} opts
 * @param {string} opts.rawQuery     - The raw user message
 * @param {object} opts.parsedJson   - The AI-parsed JSON
 * @param {string} opts.model        - The AI model used
 * @param {number} opts.tokensUsed   - Total tokens consumed
 */
export async function logSearch({ rawQuery, parsedJson, model, tokensUsed = 0 }) {
  try {
    await connectDB();
    const date = todayStr();

    // Upsert daily stats
    await DailyStats.findOneAndUpdate(
      { date },
      {
        $inc: {
          totalSearches: 1,
          successfulReplies: 1,
          totalTokens: tokensUsed,
          [`tokensByModel.${model || 'unknown'}`]: tokensUsed,
        }
      },
      { upsert: true }
    );

    // Insert search log entry
    await SearchLog.create({ date, rawQuery, parsedJson, model, tokensUsed, success: true });
  } catch (err) {
    console.error('[Analytics] logSearch failed (non-critical):', err.message);
  }
}

/**
 * Log a failed parse.
 * @param {string} rawQuery
 * @param {string} errorMessage
 */
export async function logFailedParse(rawQuery, errorMessage) {
  try {
    await connectDB();
    const date = todayStr();

    await DailyStats.findOneAndUpdate(
      { date },
      { $inc: { totalSearches: 1, failedParses: 1 } },
      { upsert: true }
    );

    await FailedParse.create({ date, rawQuery, errorMessage });
  } catch (err) {
    console.error('[Analytics] logFailedParse failed (non-critical):', err.message);
  }
}

/**
 * Fetch analytics data for the admin dashboard.
 * Returns daily stats for the last N days + top searches + recent failed parses.
 * @param {number} days - How many past days to fetch (default 30)
 */
export async function getAnalytics(days = 30) {
  await connectDB();

  // Date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().slice(0, 10);

  // 1. Daily stats (last N days)
  const dailyStats = await DailyStats.find(
    { date: { $gte: startStr } },
    { _id: 0, date: 1, totalSearches: 1, successfulReplies: 1, failedParses: 1, totalTokens: 1, tokensByModel: 1 }
  ).sort({ date: 1 }).lean();

  // 2. Top searches (last 30 days, top 15)
  const topSearches = await SearchLog.aggregate([
    { $match: { date: { $gte: startStr }, success: true } },
    { $group: { _id: '$rawQuery', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
    { $project: { query: '$_id', count: 1, _id: 0 } }
  ]);

  // 3. Token usage by model (last 30 days)
  const tokensByModel = await SearchLog.aggregate([
    { $match: { date: { $gte: startStr }, model: { $ne: null } } },
    { $group: { _id: '$model', totalTokens: { $sum: '$tokensUsed' }, count: { $sum: 1 } } },
    { $sort: { totalTokens: -1 } },
    { $project: { model: '$_id', totalTokens: 1, count: 1, _id: 0 } }
  ]);

  // 4. Recent failed parses (last 50)
  const failedParses = await FailedParse.find(
    { date: { $gte: startStr } },
    { _id: 0, rawQuery: 1, errorMessage: 1, timestamp: 1, date: 1 }
  ).sort({ timestamp: -1 }).limit(50).lean();

  // 5. Today summary
  const todayStats = dailyStats.find(s => s.date === todayStr()) || {
    totalSearches: 0, successfulReplies: 0, failedParses: 0, totalTokens: 0
  };

  return { dailyStats, topSearches, tokensByModel, failedParses, todayStats };
}
