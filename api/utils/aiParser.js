import { extractFiltersFromQuery } from './queryRules.js';
import axios from 'axios';

export async function parseUserMessage(query, activeFilters = {}) {
  const userMsg = query.trim();

  // 🧠 0. Rule Engine (Zero-Cost Bypass) 🧠
  const { extracted, confident } = extractFiltersFromQuery(userMsg);
  const hasActiveFilters = activeFilters && Object.keys(activeFilters).length > 0;
  
  // Only bypass LLM if there are NO active filters.
  // If there are active filters, we rely on the LLM (on the main server) to intelligently decide 
  // whether to merge (refinement) or discard (new search).
  if (confident && !hasActiveFilters) {
    console.log(`[AI] ⚡ Skipped LLM — Rules confident:`, extracted);
    return {
      result: extracted,
      model: "rules-engine",
      tokensUsed: 0
    };
  }

  // ── 1. Call Main Backend AI Search ─────────────────────────────────────────
  const API_URL = process.env.MAIN_API_URL || 'https://api.numberwale.com';
  
  try {
    console.log(`[AI] Forwarding query to backend aiSearch...`);
    const response = await axios.post(`${API_URL}/api/v1/aiSearch`, {
      query: userMsg,
      activeFilters: activeFilters
    }, { timeout: 15000 }); // 15s timeout for AI

    const data = response.data;
    const parsedResult = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

    console.log(`[AI] ✅ Backend AI parsed successfully.`);
    return {
      result: parsedResult,
      model: "backend-ai-search",
      tokensUsed: 0,
    };
  } catch (err) {
    console.error(`[AI] Backend AI Search failed: ${err.message}`);
    // If backend fails but rules extracted something, use it as fallback
    if (Object.keys(extracted).length > 0) {
      console.warn(`[RULES] Backend LLM failed, using partial rule extraction:`, extracted);
      return {
        result: extracted,
        model: "rules-engine-fallback",
        tokensUsed: 0
      };
    }
    throw new Error("AI search failed: " + err.message);
  }
}
