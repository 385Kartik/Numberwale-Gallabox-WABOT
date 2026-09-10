import dotenv from 'dotenv';
dotenv.config();
import { parseUserMessage } from '../api/utils/aiParser.js';
import { fetchNumbers } from '../api/utils/searchApi.js';

async function test() {
  const activeFilters = {};
  const userMessage = "Business, 5 frequently and 15000 budget";
  
  try {
    const parsed = await parseUserMessage(userMessage, activeFilters);
    console.log("Parsed result:", parsed);
    const result = await fetchNumbers(parsed.result);
    console.log("Products found:", result.products?.length);
  } catch (e) {
    console.error(e);
  }
  process.exit();
}
test();
