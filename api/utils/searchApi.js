import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER ENGINE — Ported exactly from classifier.html
// Assigns category ID and match positions for bold formatting
// ─────────────────────────────────────────────────────────────────────────────
function findOccurrences(str, pattern) {
  const matches = [];
  let pos = 0;
  while ((pos = str.indexOf(pattern, pos)) !== -1) {
    matches.push([pos, pos + pattern.length]);
    pos += pattern.length;
  }
  return matches;
}

function classifyEngine(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (!d || d.length < 2) return { catId: 24, matches: [] };

  // 786
  const i786 = d.indexOf('786');
  if (i786 !== -1) return { catId: 7, matches: [[i786, i786 + 3]] };

  // 108
  const i108 = d.indexOf('108');
  if (i108 !== -1) return { catId: 8, matches: [[i108, i108 + 3]] };

  // Mirror (5+5 same)
  if (d.length >= 10 && d.slice(0, 5) === d.slice(5, 10)) {
    return { catId: 2, matches: [[0, 5]] };
  }

  // Max run of same digit
  let maxRun = 1, cur = 1, bestStart = 0;
  for (let i = 1; i < d.length; i++) {
    if (d[i] === d[i - 1]) { cur++; if (cur > maxRun) { maxRun = cur; bestStart = i - cur + 1; } }
    else { cur = 1; }
  }
  if (maxRun >= 8) return { catId: 23, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 7) return { catId: 22, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 6) return { catId: 21, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 5) return { catId: 20, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 4) return { catId: 19, matches: [[bestStart, bestStart + maxRun]] };

  // Semi-mirror (4+4 same)
  for (let i = 0; i <= d.length - 8; i++) {
    for (let j = i + 4; j <= d.length - 4; j++) {
      if (d.slice(i, i + 4) === d.slice(j, j + 4) && new Set(d.slice(i, i + 4)).size > 1) {
        return { catId: 3, matches: [[i, i + 4], [j, j + 4]] };
      }
    }
  }

  // ABC ABC ABC
  let bestAbc = [], maxAbcCount = 0;
  for (let i = 0; i <= d.length - 3; i++) {
    const p = d.slice(i, i + 3);
    if (p[0] === p[1] && p[1] === p[2]) continue;
    const occ = findOccurrences(d, p);
    if (occ.length > maxAbcCount) { maxAbcCount = occ.length; bestAbc = occ; }
  }
  if (maxAbcCount >= 3) return { catId: 15, matches: bestAbc.slice(0, 3) };

  // AB AB AB
  for (let i = 0; i <= d.length - 6; i++) {
    const p = d.slice(i, i + 2);
    if (p[0] === p[1]) continue;
    if (p === d.slice(i + 2, i + 4) && p === d.slice(i + 4, i + 6)) {
      return { catId: 11, matches: [[i, i + 2], [i + 2, i + 4], [i + 4, i + 6]] };
    }
  }
  if (maxAbcCount >= 2) return { catId: 16, matches: bestAbc.slice(0, 2) };

  // AB AB XY XY
  const ababRegex = /(\d)(\d)\1\2/g;
  let match_abab;
  const ababMatches = [];
  while ((match_abab = ababRegex.exec(d)) !== null) {
    if (match_abab[1] !== match_abab[2]) ababMatches.push([match_abab.index, match_abab.index + 4]);
  }
  if (ababMatches.length >= 2) return { catId: 10, matches: ababMatches.slice(0, 2) };

  // AAA BBB
  const trips = [];
  let j = 0;
  while (j < d.length) {
    let k = j;
    while (k < d.length && d[k] === d[j]) k++;
    if (k - j >= 3) trips.push([j, j + 3]);
    j = k;
  }
  if (trips.length >= 2) return { catId: 17, matches: trips.slice(0, 2) };

  // Triple (single run of 3)
  if (maxRun >= 3) return { catId: 18, matches: [[bestStart, bestStart + maxRun]] };

  // Two/Three digit numbers
  const uniqueCount = new Set(d).size;
  if (uniqueCount === 2) return { catId: 4, matches: [] };
  if (uniqueCount === 3) return { catId: 5, matches: [] };

  // Doubling (pairs)
  const pairs = [];
  let idx = 0;
  while (idx < d.length - 1) {
    if (d[idx] === d[idx + 1]) { pairs.push([idx, idx + 2]); idx += 2; }
    else { idx++; }
  }
  if (pairs.length >= 2) return { catId: 9, matches: pairs };

  // Start AB AB
  if (d.length >= 4 && d[0] !== d[1] && d[0] === d[2] && d[1] === d[3]) return { catId: 12, matches: [[0, 4]] };

  // Middle AB AB
  for (let i = 1; i <= d.length - 5; i++) {
    if (d[i] === d[i + 1]) continue;
    if (d[i] === d[i + 2] && d[i + 1] === d[i + 3]) return { catId: 13, matches: [[i, i + 4]] };
  }

  // Ending AB AB
  if (d.length >= 4) {
    const L = d.length;
    if (d[L - 4] !== d[L - 3] && d[L - 4] === d[L - 2] && d[L - 3] === d[L - 1]) return { catId: 14, matches: [[L - 4, L]] };
  }

  // Counting
  const tens = ['10','20','30','40','50','60','70','80','90'];
  const hundreds = ['100','200','300','400','500','600','700','800','900'];
  for (let i = 0; i < tens.length - 2; i++) {
    const i1 = d.indexOf(tens[i]), i2 = d.indexOf(tens[i + 1]), i3 = d.indexOf(tens[i + 2]);
    if (i1 !== -1 && i2 !== -1 && i3 !== -1) return { catId: 6, matches: [[i1, i1 + 2], [i2, i2 + 2], [i3, i3 + 2]] };
    const j1 = d.indexOf(hundreds[i]), j2 = d.indexOf(hundreds[i + 1]), j3 = d.indexOf(hundreds[i + 2]);
    if (j1 !== -1 && j2 !== -1 && j3 !== -1) return { catId: 6, matches: [[j1, j1 + 3], [j2, j2 + 3], [j3, j3 + 3]] };
  }

  // Without 248
  if (!/[248]/.test(d)) return { catId: 1, matches: [] };
  return { catId: 24, matches: [] };
}

/**
 * Format a 10-digit number with dashes + *bold* for WhatsApp
 * Pattern segments get wrapped in * for WhatsApp bold
 */
function formatNumberForWhatsApp(number) {
  const d = String(number).replace(/\D/g, '');
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

    if (jsonQuery.mostContainDigit && jsonQuery.mostContainCount) {
      advancedFields.mostContain = { digit: String(jsonQuery.mostContainDigit), count: Number(jsonQuery.mostContainCount) };
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

    console.log(`[Search] Querying ${API_URL}/api/v1/products/get-products with:`, finalQuery);

    const response = await axios.get(`${API_URL}/api/v1/products/get-products`, { params: finalQuery });

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
export function formatNumbersReply(products, totalCount = 0, currentPage = 1, totalPages = 1) {
  if (!products || products.length === 0) {
    return "Sorry, abhi aapki requirement ke hisaab se koi number available nahi hai. Kuch aur try kariye! 🙏";
  }

  let reply = `✨ *${totalCount} numbers found!* (Page ${currentPage}/${totalPages})\n`;
  reply += `━━━━━━━━━━━━━━━━━\n\n`;

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

    const formattedNum = formatNumberForWhatsApp(number);
    reply += `${index + 1}. ${formattedNum}\n`;
    if (catName) reply += `   📁 ${catName}\n`;
    if (brand)   reply += `   🏷️  ${brand}\n`;

    if (subtotal) {
      const gstAmt = Math.round(subtotal * 0.18);
      const totalAmt = subtotal + gstAmt;

      if (effDiscount > 0 && basePrice) {
        const discountAmt = Math.round(basePrice * (effDiscount / 100));
        reply += `   💰 ~₹${basePrice.toLocaleString('en-IN')}~ ₹${subtotal.toLocaleString('en-IN')} *(${effDiscount}% off)*\n`;
        reply += `   🏛️ +GST 18%: ₹${gstAmt.toLocaleString('en-IN')}\n`;
        reply += `   ✅ *Total: ₹${totalAmt.toLocaleString('en-IN')}*\n`;
      } else {
        reply += `   💰 Subtotal: ₹${subtotal.toLocaleString('en-IN')}\n`;
        reply += `   🏛️ +GST 18%: ₹${gstAmt.toLocaleString('en-IN')}\n`;
        reply += `   ✅ *Total: ₹${totalAmt.toLocaleString('en-IN')}*\n`;
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
  if (currentPage < totalPages) {
    reply += `👉 Reply *"more"* for next page\n`;
  }
  reply += `👉 Reply *"reset"* for new search\n`;
  reply += `👉 Reply *"agent"* to talk to us\n\n`;
  reply += `🛒 *Kharidne ke liye reply karo:*\n`;
  reply += `_"buy ${products[0]?.productMobileNumber}"_`;

  return reply;
}
