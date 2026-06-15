import { getAnalytics } from './utils/analytics.js';

/**
 * GET /api/analytics
 * Returns bot analytics for the admin dashboard.
 * 
 * Query params:
 *   ?days=30       — how many past days (default 30)
 * 
 * Protected by ADMIN_SECRET header.
 */
export default async function handler(req, res) {
  // CORS headers for admin frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  // Auth check
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const provided = req.headers['x-admin-secret'];
    if (!provided || provided !== adminSecret) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
  }

  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 90); // max 90 days
    const data = await getAnalytics(days);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error('[Analytics API] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch analytics.', details: err.message });
  }
}
