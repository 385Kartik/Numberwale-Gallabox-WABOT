import dotenv from 'dotenv';
dotenv.config();
import { parseUserMessage } from './api/utils/aiParser.js';

async function test() {
  const activeFilters = { category: "counting-numbers" };
  const userMessage = "REQ MIRROR NUMBER";
  
  try {
    const parsed = await parseUserMessage(userMessage, activeFilters);
    console.log("Parsed result:", parsed);
  } catch (e) {
    console.error(e);
  }
  process.exit();
}
test();
