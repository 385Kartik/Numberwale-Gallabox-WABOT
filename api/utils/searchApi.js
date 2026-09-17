import axios from 'axios';
import { classifyEngine } from './numberClassifier.js';

/**
 * Format a 10-digit number with spaces for WhatsApp
 * If product has customDesignProductMobileNumber (e.g. 967-*167*-72-*167*):
 * - Removes all '*' asterisks
 * - Replaces '-' hyphens with ' ' spaces
 */
function formatNumberForWhatsApp(number, p) {
  const custom = p?.customDesignProductMobileNumber;
  if (custom && typeof custom === 'string' && custom.trim()) {
    const cleaned = custom
      .replace(/\*/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 10) {
      return cleaned;
    }
  }

  const rawStr = String(number || '');
  if (rawStr.includes('*') || rawStr.includes('-')) {
    const cleaned = rawStr
      .replace(/\*/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 10) {
      return cleaned;
    }
  }

  const d = rawStr.replace(/\D/g, '');
  if (d.length !== 10) return number;

  const { matches } = classifyEngine(d);
  if (!matches || matches.length === 0) {
    // No pattern — just group as 5 5
    return `${d.slice(0, 5)} ${d.slice(5)}`;
  }

  const sorted = [...matches].sort((a, b) => a[0] - b[0]);
  let result = '';
  let last = 0;

  for (const [start, end] of sorted) {
    if (start > last) {
      // Non-pattern section: add space between segments
      const seg = d.slice(last, start);
      result += (result ? ' ' : '') + seg;
      result += ' ';
    } else if (result) {
      result += ' ';
    }
    // Pattern section: no bold, just text
    result += `${d.slice(start, end)}`;
    last = end;
  }
  if (last < d.length) {
    result += (result ? ' ' : '') + d.slice(last);
  }

  // Remove any double spaces
  return result.replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH NUMBERS
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchNumbers(jsonQuery, page = 1) {
  const API_URL = process.env.MAIN_API_URL || 'https://api.numberwale.com';
  const PAGE_SIZE = 5;
  try {
    console.log(`[Search] AI JSON Output:`, jsonQuery);

    const searchParams = {};
    const advancedFields = {};

    if (jsonQuery.startsWith)          advancedFields.startsWith = jsonQuery.startsWith;
    if (jsonQuery.endsWith)            advancedFields.endsWith = jsonQuery.endsWith;
    if (jsonQuery.anywhere)            advancedFields.anywhere = jsonQuery.anywhere;
    if (jsonQuery.mustContain)         advancedFields.mustContain = jsonQuery.mustContain;
    if (jsonQuery.notContain)          advancedFields.notContain = jsonQuery.notContain;
    if (jsonQuery.literSum)            advancedFields.literSum = Number(jsonQuery.literSum);
    if (jsonQuery.trapSum)             advancedFields.trapSum = Number(jsonQuery.trapSum);
    if (jsonQuery.scoreSum)            advancedFields.scoreSum = Number(jsonQuery.scoreSum);
    if (jsonQuery.exactDigitPlacement) advancedFields.exactDigitPlacement = jsonQuery.exactDigitPlacement;

    if (jsonQuery.mostContainDigit) {
      advancedFields.mostContain = { 
        digit: String(jsonQuery.mostContainDigit), 
        count: Number(jsonQuery.mostContainCount) || 3 
      };
    }

    for (let i = 1; i <= 10; i++) {
      if (jsonQuery[`digitFreq${i}Digit`] && jsonQuery[`digitFreq${i}Count`]) {
        advancedFields[`digitFreq${i}Digit`] = String(jsonQuery[`digitFreq${i}Digit`]);
        advancedFields[`digitFreq${i}Count`] = Number(jsonQuery[`digitFreq${i}Count`]);
        if (jsonQuery[`digitFreq${i}MaxCount`]) {
          advancedFields[`digitFreq${i}MaxCount`] = Number(jsonQuery[`digitFreq${i}MaxCount`]);
        }
      }
    }

    if (Object.keys(advancedFields).length > 0) searchParams.advanced = advancedFields;

    let priceRangeStr = null;
    if (jsonQuery.minPrice && jsonQuery.maxPrice) {
      priceRangeStr = `${jsonQuery.minPrice}-${jsonQuery.maxPrice}`;
    } else if (jsonQuery.minPrice) {
      priceRangeStr = `${jsonQuery.minPrice}-1000000`;
    } else if (jsonQuery.maxPrice) {
      priceRangeStr = `0-${jsonQuery.maxPrice}`;
    }

    const finalQuery = { search: searchParams, page, limit: PAGE_SIZE };
    if (jsonQuery.category) finalQuery.category = jsonQuery.category;
    if (priceRangeStr) finalQuery.priceRange = priceRangeStr;
    // Auto sort by price ascending when budget is provided (so cheapest options surface first)
    const sortPrice = jsonQuery.sortPrice || (jsonQuery.maxPrice ? 'lowToHigh' : null);
    if (sortPrice) finalQuery.sortPrice = sortPrice;
    if (jsonQuery.sortBy) finalQuery.sortBy = jsonQuery.sortBy;
    if (jsonQuery.isDirectFromOperator !== undefined) {
      finalQuery.isDirectFromOperator = String(jsonQuery.isDirectFromOperator);
    }
    if (jsonQuery.operatorState) {
      finalQuery.operatorState = jsonQuery.operatorState;
    }

    console.log(`[Search] Querying ${API_URL}/api/v1/products/get-products with:`, finalQuery);

    // Timeout is set to 7000ms (7 seconds) to prevent Vercel Serverless Function (10s limit) from killing the execution.
    // This ensures we catch the timeout and gracefully reply with "Oops!" instead of dropping the message entirely.
    const response = await axios.get(`${API_URL}/api/v1/products/get-products`, { params: finalQuery, timeout: 7000 });

    if (response.data && Array.isArray(response.data.products)) {
      return {
        products: response.data.products,
        totalCount: response.data.metadata?.totalCount || 0,
        totalPages: response.data.metadata?.totalPages || 1,
        currentPage: response.data.metadata?.currentPage || page,
      };
    }
    return { products: [], totalCount: 0, totalPages: 0, currentPage: page };
  } catch (error) {
    console.error("[Search] Error fetching numbers:", error.message);
    return { products: [], totalCount: 0, totalPages: 0, currentPage: page };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT REPLY — WhatsApp formatted message with classified bold numbers
// ─────────────────────────────────────────────────────────────────────────────
export function formatNumbersReply(products, totalCount = 0, currentPage = 1, totalPages = 1, lang = 'English') {
  if (!products || products.length === 0) {
    if (lang === 'English') {
      return "Sorry, no numbers are available matching your requirements right now. Please try something else! 🙏";
    } else if (lang === 'Hindi') {
      return "माफ़ कीजिये, अभी आपकी आवश्यकता के अनुसार कोई नंबर उपलब्ध नहीं है। कृपया कुछ और प्रयास करें! 🙏";
    } else if (lang === 'Gujarati') {
      return "માફ કરશો, અત્યારે તમારી જરૂરિયાત મુજબ કોઈ નંબર ઉપલબ્ધ નથી. કૃપા કરીને બીજું કંઈક અજમાવો! 🙏";
    } else if (lang === 'Marathi') {
      return "क्षमस्व, सध्या तुमच्या गरजेनुसार कोणताही नंबर उपलब्ध नाही. कृपया दुसरे काहीतरी वापरून पहा! 🙏";
    } else {
      // Hinglish
      return "Sorry, abhi aapki requirement ke hisaab se koi number available nahi hai. Kuch aur try kariye! 🙏";
    }
  }

  let headerText = `✨ *${totalCount} numbers found!* (Page ${currentPage}/${totalPages})\n`;
  if (lang === 'Hindi') {
    headerText = `✨ *${totalCount} नंबर मिले!* (पेज ${currentPage}/${totalPages})\n`;
  } else if (lang === 'Gujarati') {
    headerText = `✨ *${totalCount} નંબર મળ્યા!* (પેજ ${currentPage}/${totalPages})\n`;
  } else if (lang === 'Marathi') {
    headerText = `✨ *${totalCount} नंबर सापडले!* (पान ${currentPage}/${totalPages})\n`;
  } else if (lang === 'Hinglish') {
    headerText = `✨ *${totalCount} numbers mile!* (Page ${currentPage}/${totalPages})\n`;
  }

  let reply = headerText;
  reply += `━━━━━━━━━━━━━━━━━\n\n`;

  let labelSubtotal = 'Subtotal';
  let labelGst = '+GST 18%';
  let labelTotal = 'Total';
  let labelOff = 'off';

  if (lang === 'Hindi') {
    labelSubtotal = 'उप-योग (Subtotal)';
    labelGst = '+जीएसटी / GST 18%';
    labelTotal = 'कुल (Total)';
    labelOff = 'छूट';
  } else if (lang === 'Gujarati') {
    labelSubtotal = 'પેટા સરવાળો (Subtotal)';
    labelGst = '+જીએસટી / GST 18%';
    labelTotal = 'કુલ (Total)';
    labelOff = 'ડિસ્કાઉન્ટ';
  } else if (lang === 'Marathi') {
    labelSubtotal = 'उप-एकूण (Subtotal)';
    labelGst = '+जीएसटी / GST 18%';
    labelTotal = 'एकूण (Total)';
    labelOff = 'सूट';
  }

  products.forEach((p, index) => {
    const number   = p.productMobileNumber || 'N/A';
    const subtotal = p.pricing?.nwFinalPrice || null;   // nwFinalPrice = subtotal (before GST)
    const basePrice = p.pricing?.nwBasePrice?.inr || null;
    const myDiscount = p.pricing?.nwMyDiscount || 0;
    const vendorDiscount = p.vendor?.vendorDiscount || 0;
    const effDiscount = myDiscount !== 0 ? myDiscount : vendorDiscount;
    const catName  = p.category?.name || null;
    const brand    = p.productBrand || null;
    const liters   = p.liters ?? null;
    const trap     = p.trap ?? null;
    const score    = p.score ?? null;

    const formattedNum = formatNumberForWhatsApp(number, p);
    reply += `${index + 1}. *${formattedNum}*\n`;
    if (catName) reply += `   📁 ${catName}\n`;
    if (p.isDirectFromOperator) {
      const stateStr = p.operatorState ? `${p.operatorState} Circle` : 'State-Specific';
      const providerStr = p.operatorProvider ? ` (${p.operatorProvider})` : '';
      reply += `   ⚡ *Instant 5-Min Activation* — ${stateStr}${providerStr}\n`;
      reply += `   ⚠️ _Note: Valid only for ${p.operatorState || 'this state'} residents!_\n`;
    } else if (p.readyToPort) {
      const rtpStr = p.readyToPort === 'rtp' ? 'Ready to Port' : 'Cond. RTP';
      reply += `   🌐 *All-India MNP* (${rtpStr} — Any Operator/State)\n`;
    }
    if (brand)   reply += `   🏷️  ${brand}\n`;

    if (subtotal) {
      const gstAmt = Math.round(subtotal * 0.18);
      const totalAmt = subtotal + gstAmt;

      if (effDiscount > 0 && basePrice) {
        const discountAmt = Math.round(basePrice * (effDiscount / 100));
        reply += `   💰 ~₹${basePrice.toLocaleString('en-IN')}~ ₹${subtotal.toLocaleString('en-IN')} *(${effDiscount}% ${labelOff})*\n`;
        reply += `   🏛️ ${labelGst}: ₹${gstAmt.toLocaleString('en-IN')}\n`;
        reply += `   ✅ *${labelTotal}: ₹${totalAmt.toLocaleString('en-IN')}*\n`;
      } else {
        reply += `   💰 ${labelSubtotal}: ₹${subtotal.toLocaleString('en-IN')}\n`;
        reply += `   🏛️ ${labelGst}: ₹${gstAmt.toLocaleString('en-IN')}\n`;
        reply += `   ✅ *${labelTotal}: ₹${totalAmt.toLocaleString('en-IN')}*\n`;
      }
    }

    const numsLine = [];
    if (liters !== null) numsLine.push(`Sum: ${liters}`);
    if (trap !== null)   numsLine.push(`Mid: ${trap}`);
    if (score !== null)  numsLine.push(`Total: ${score}`);
    if (numsLine.length > 0) reply += `   🔢 ${numsLine.join(' | ')}\n`;

    reply += '\n';
  });

  reply += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;

  if (lang === 'Hindi') {
    if (currentPage < totalPages) reply += `👉 अगले पेज के लिए *"more"* रिप्लाई करें\n`;
    reply += `👉 नई खोज के लिए *"reset"* रिप्लाई करें\n`;
    reply += `👉 हमसे बात करने के लिए *"agent"* रिप्लाई करें\n`;
    reply += `👉 भाषा बदलने के लिए *"language"* रिप्लाई करें\n\n`;
    reply += `🛒 *खरीदने के लिए रिप्लाई करें:*\n`;
  } else if (lang === 'Gujarati') {
    if (currentPage < totalPages) reply += `👉 આગળના પેજ માટે *"more"* રિપ્લાય કરો\n`;
    reply += `👉 નવી શોધ માટે *"reset"* રિપ્લાય કરો\n`;
    reply += `👉 અમારી સાથે વાત કરવા માટે *"agent"* રિપ્લાય કરો\n`;
    reply += `👉 ભાષા બદલવા માટે *"language"* રિપ્લાય કરો\n\n`;
    reply += `🛒 *ખરીદવા માટે રિપ્લાય કરો:*\n`;
  } else if (lang === 'Marathi') {
    if (currentPage < totalPages) reply += `👉 पुढच्या पानासाठी *"more"* रिप्लाय करा\n`;
    reply += `👉 नवीन शोधासाठी *"reset"* रिप्लाय करा\n`;
    reply += `👉 आमच्याशी बोलण्यासाठी *"agent"* रिप्लाय करा\n`;
    reply += `👉 भाषा बदलण्यासाठी *"language"* रिप्लाय करा\n\n`;
    reply += `🛒 *खरेदी करण्यासाठी रिप्लाय करा:*\n`;
  } else if (lang === 'Hinglish') {
    if (currentPage < totalPages) reply += `👉 Agle page ke liye *"more"* reply karein\n`;
    reply += `👉 Nayi search ke liye *"reset"* reply karein\n`;
    reply += `👉 Agent se baat karne ke liye *"agent"* reply karein\n`;
    reply += `👉 Language badalne ke liye *"language"* reply karein\n\n`;
    reply += `🛒 *Kharidne ke liye reply karo:*\n`;
  } else {
    // English
    if (currentPage < totalPages) reply += `👉 Reply *"more"* for next page\n`;
    reply += `👉 Reply *"reset"* for new search\n`;
    reply += `👉 Reply *"agent"* to talk to us\n`;
    reply += `👉 Reply *"language"* to change language\n\n`;
    reply += `🛒 *To buy, please reply:*\n`;
  }

  const firstClean = String(products[0]?.productMobileNumber || '').replace(/\D/g, '') || products[0]?.productMobileNumber;
  reply += `_"buy ${firstClean}"_`;

  return reply;
}
