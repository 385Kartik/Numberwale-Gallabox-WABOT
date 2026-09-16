'use strict';
/**
 * numberClassifier.js - VIP Number Classification & Similar Number Finder
 * Ported 1:1 from numberwale-admin/src/utils/numberClassifier.ts and
 * numberwale-web/src/components/ProductSection.jsx + SimilarProducts.jsx
 */

export function findOccurrences(str, pattern) {
  const matches = [];
  let pos = 0;
  while ((pos = str.indexOf(pattern, pos)) !== -1) {
    matches.push([pos, pos + pattern.length]);
    pos += pattern.length;
  }
  return matches;
}

export function classifyEngine(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (!d || d.length < 2) return { catId: 24, matches: [] };

  // 1. 786 Numbers
  const i786 = d.indexOf('786');
  if (i786 !== -1) return { catId: 7, matches: [[i786, i786 + 3]] };

  // 2. 108 Numbers
  const i108 = d.indexOf('108');
  if (i108 !== -1) return { catId: 8, matches: [[i108, i108 + 3]] };

  // 3. Mirror (5+5 same)
  if (d.length >= 10 && d.slice(0, 5) === d.slice(5, 10)) {
    return { catId: 2, matches: [[0, 5]] };
  }

  // 4. Consecutive same digits (Octa, Septa, Hexa, Penta, Tetra)
  let maxRun = 1, cur = 1, bestStart = 0;
  for (let i = 1; i < d.length; i++) {
    if (d[i] === d[i - 1]) {
      cur++;
      if (cur > maxRun) { maxRun = cur; bestStart = i - cur + 1; }
    } else {
      cur = 1;
    }
  }
  if (maxRun >= 8) return { catId: 23, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 7) return { catId: 22, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 6) return { catId: 21, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 5) return { catId: 20, matches: [[bestStart, bestStart + maxRun]] };
  if (maxRun >= 4) return { catId: 19, matches: [[bestStart, bestStart + maxRun]] };

  // 5. Semi-mirror (4+4 same with pivot)
  for (let i = 0; i <= d.length - 8; i++) {
    for (let j = i + 4; j <= d.length - 4; j++) {
      if (d.slice(i, i + 4) === d.slice(j, j + 4) && new Set(d.slice(i, i + 4)).size > 1) {
        return { catId: 3, matches: [[i, i + 4], [j, j + 4]] };
      }
    }
  }

  // 6. ABC ABC ABC
  let bestAbc = [];
  let maxAbcCount = 0;
  for (let i = 0; i <= d.length - 3; i++) {
    const p = d.slice(i, i + 3);
    if (p[0] === p[1] && p[1] === p[2]) continue;
    const occ = findOccurrences(d, p);
    if (occ.length > maxAbcCount) { maxAbcCount = occ.length; bestAbc = occ; }
  }
  if (maxAbcCount >= 3) return { catId: 15, matches: bestAbc.slice(0, 3) };

  // 7. AB AB AB
  for (let i = 0; i <= d.length - 6; i++) {
    const p = d.slice(i, i + 2);
    if (p[0] === p[1]) continue;
    if (p === d.slice(i + 2, i + 4) && p === d.slice(i + 4, i + 6)) {
      return { catId: 11, matches: [[i, i + 2], [i + 2, i + 4], [i + 4, i + 6]] };
    }
  }
  if (maxAbcCount >= 2) return { catId: 16, matches: bestAbc.slice(0, 2) };

  // 8. AB AB XY XY
  const ababRegex = /(\d)(\d)\1\2/g;
  let match_abab;
  const ababMatches = [];
  while ((match_abab = ababRegex.exec(d)) !== null) {
    if (match_abab[1] !== match_abab[2]) {
      ababMatches.push([match_abab.index, match_abab.index + 4]);
    }
  }
  if (ababMatches.length >= 2) return { catId: 10, matches: ababMatches.slice(0, 2) };

  // 9. AAA BBB
  const trips = [];
  let j = 0;
  while (j < d.length) {
    let k = j;
    while (k < d.length && d[k] === d[j]) k++;
    if (k - j >= 3) trips.push([j, j + 3]);
    j = k;
  }
  if (trips.length >= 2) return { catId: 17, matches: trips.slice(0, 2) };

  // 10. Triple (single run of 3)
  if (maxRun >= 3) return { catId: 18, matches: [[bestStart, bestStart + maxRun]] };

  // 11. Two-digit & Three-digit unique sets
  const uniqueCount = new Set(d).size;
  if (uniqueCount === 2) return { catId: 4, matches: [] };
  if (uniqueCount === 3) return { catId: 5, matches: [] };

  // 12. Doubling numbers (pairs)
  const pairs = [];
  let idx = 0;
  while (idx < d.length - 1) {
    if (d[idx] === d[idx + 1]) {
      pairs.push([idx, idx + 2]);
      idx += 2;
    } else {
      idx++;
    }
  }
  if (pairs.length >= 2) return { catId: 9, matches: pairs };

  // 13. Start AB AB
  if (d.length >= 4 && d[0] !== d[1] && d[0] === d[2] && d[1] === d[3]) return { catId: 12, matches: [[0, 4]] };

  // 14. Middle AB AB
  for (let i = 1; i <= d.length - 5; i++) {
    if (d[i] === d[i + 1]) continue;
    if (d[i] === d[i + 2] && d[i + 1] === d[i + 3]) return { catId: 13, matches: [[i, i + 4]] };
  }

  // 15. Ending AB AB
  if (d.length >= 4) {
    const L = d.length;
    if (d[L - 4] !== d[L - 3] && d[L - 4] === d[L - 2] && d[L - 3] === d[L - 1]) return { catId: 14, matches: [[L - 4, L]] };
  }

  // 16. Counting (tens & hundreds)
  const tens = ['10', '20', '30', '40', '50', '60', '70', '80', '90'];
  const hundreds = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
  for (let i = 0; i < tens.length - 2; i++) {
    let i1 = d.indexOf(tens[i]);
    let i2 = d.indexOf(tens[i + 1]);
    let i3 = d.indexOf(tens[i + 2]);
    if (i1 !== -1 && i2 !== -1 && i3 !== -1) return { catId: 6, matches: [[i1, i1 + 2], [i2, i2 + 2], [i3, i3 + 2]] };

    let j1 = d.indexOf(hundreds[i]);
    let j2 = d.indexOf(hundreds[i + 1]);
    let j3 = d.indexOf(hundreds[i + 2]);
    if (j1 !== -1 && j2 !== -1 && j3 !== -1) return { catId: 6, matches: [[j1, j1 + 3], [j2, j2 + 3], [j3, j3 + 3]] };
  }

  // 17. Counting (sequential matches)
  let bestSeqMatches = [];
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= d.length - (len * 3); i++) {
      const seqMatches = [[i, i + len]];
      let currVal = parseInt(d.slice(i, i + len), 10);
      let pIdx = i + len;
      const isAsc = parseInt(d.slice(pIdx, pIdx + len), 10) === currVal + 1;
      const isDesc = parseInt(d.slice(pIdx, pIdx + len), 10) === currVal - 1;

      if (isAsc || isDesc) {
        while (pIdx <= d.length - len) {
          const nVal = parseInt(d.slice(pIdx, pIdx + len), 10);
          if ((isAsc && nVal === currVal + 1) || (isDesc && nVal === currVal - 1)) {
            seqMatches.push([pIdx, pIdx + len]);
            currVal = nVal;
            pIdx += len;
          } else {
            break;
          }
        }
        if (seqMatches.length >= 3 && seqMatches.length > bestSeqMatches.length) {
          bestSeqMatches = seqMatches;
        }
      }
    }
  }
  if (bestSeqMatches.length >= 3) {
    return { catId: 6, matches: bestSeqMatches };
  }

  // 18. Ascending / Descending runs
  let maxAsc = 1, curAsc = 1, bestAscStart = 0, curAscStart = 0;
  let maxDesc = 1, curDesc = 1, bestDescStart = 0, curDescStart = 0;

  for (let i = 1; i < d.length; i++) {
    if (+d[i] === +d[i - 1] + 1) {
      curAsc++;
      if (curAsc > maxAsc) { maxAsc = curAsc; bestAscStart = curAscStart; }
    } else {
      curAsc = 1;
      curAscStart = i;
    }

    if (+d[i] === +d[i - 1] - 1) {
      curDesc++;
      if (curDesc > maxDesc) { maxDesc = curDesc; bestDescStart = curDescStart; }
    } else {
      curDesc = 1;
      curDescStart = i;
    }
  }

  if (maxAsc >= 3 || maxDesc >= 3) {
    if (maxAsc >= maxDesc) return { catId: 6, matches: [[bestAscStart, bestAscStart + maxAsc]] };
    return { catId: 6, matches: [[bestDescStart, bestDescStart + maxDesc]] };
  }

  // 19. Without 248
  if (!/[248]/.test(d)) return { catId: 1, matches: [] };

  // 20. Default Unique
  return { catId: 24, matches: [] };
}

export const CATEGORY_MAP = {
  1: { slug: 'without-248-numbers', name: 'Without 248 Numbers' },
  2: { slug: 'mirror-numbers', name: 'Mirror Numbers' },
  3: { slug: 'semi-mirror-numbers', name: 'Semi Mirror Numbers' },
  4: { slug: 'two-digit-numbers', name: 'Two Digit Numbers' },
  5: { slug: 'three-digit-numbers', name: 'Three Digit Numbers' },
  6: { slug: 'counting-numbers', name: 'Counting Numbers' },
  7: { slug: '786-numbers', name: '786 Numbers' },
  8: { slug: '108-numbers', name: '108 Numbers' },
  9: { slug: 'doubling-numbers', name: 'Doubling Numbers' },
  10: { slug: 'ab-ab-xy-xy-numbers', name: 'AB AB XY XY Numbers' },
  11: { slug: 'ab-ab-ab-numbers', name: 'AB AB AB Numbers' },
  12: { slug: 'start-ab-ab-numbers', name: 'Start AB AB Numbers' },
  13: { slug: 'middle-ab-ab-numbers', name: 'Middle AB AB Numbers' },
  14: { slug: 'ending-ab-ab-numbers', name: 'Ending AB AB Numbers' },
  15: { slug: 'abc-abc-abc-numbers', name: 'ABC ABC ABC Numbers' },
  16: { slug: 'abc-abc-numbers', name: 'ABC ABC Numbers' },
  17: { slug: 'aaa-bbb-numbers', name: 'AAA BBB Numbers' },
  18: { slug: 'triple-numbers', name: 'Triple Numbers' },
  19: { slug: 'tetra-numbers', name: 'Tetra Numbers' },
  20: { slug: 'penta-numbers', name: 'Penta Numbers' },
  21: { slug: 'hexa-numbers', name: 'Hexa Numbers' },
  22: { slug: 'septa-numbers', name: 'Septa Numbers' },
  23: { slug: 'octa-numbers', name: 'Octa Numbers' },
  24: { slug: 'unique-numbers', name: 'VIP Fancy Numbers' }
};

const API_BASE = process.env.MAIN_API_URL || 'https://api.numberwale.com';

async function fetchFromApi(endpoint, params) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.keys(params).forEach(k => {
    if (typeof params[k] === 'object' && params[k] !== null) {
      url.searchParams.append(k, JSON.stringify(params[k]));
    } else if (params[k] !== undefined && params[k] !== null) {
      url.searchParams.append(k, params[k]);
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Smart Cascading Alternative VIP Number Finder
 * Given an unavailable 10-digit number:
 * 1. Identifies category using Product Classifier
 * 2. Finds matching numbers using Website Similar logic (suffix4, suffix2, category)
 * 3. Returns up to targetCount (default 5) genuine matching VIP numbers
 */
export async function findAlternativeNumbers(rawNumber, targetCount = 5) {
  const d = String(rawNumber).replace(/\D/g, '');
  const { catId } = classifyEngine(d);
  const cat = CATEGORY_MAP[catId] || CATEGORY_MAP[24];
  const suffix4 = d.length >= 4 ? d.slice(-4) : '';
  const suffix2 = d.length >= 2 ? d.slice(-2) : '';

  const seenNumbers = new Set();
  if (d.length === 10) seenNumbers.add(d);

  const collected = [];
  let primarySearchJSON = { category: cat.slug };

  const addProducts = (products) => {
    if (!products || !Array.isArray(products)) return;
    for (const p of products) {
      const num = String(p.productMobileNumber || '').replace(/\D/g, '');
      if (num && !seenNumbers.has(num)) {
        seenNumbers.add(num);
        collected.push(p);
        if (collected.length >= targetCount) break;
      }
    }
  };

  // Step 1: Category + Suffix4 (most exact match)
  if (suffix4) {
    const d1 = await fetchFromApi('/api/v1/products/get-products', {
      category: cat.slug,
      search: { advanced: { endsWith: suffix4 } },
      limit: targetCount
    });
    if (d1?.products?.length > 0) {
      primarySearchJSON = { category: cat.slug, endsWith: suffix4 };
      addProducts(d1.products);
    }
  }

  // Step 2: Website /products/similar with Suffix4
  if (collected.length < targetCount && suffix4) {
    const d2 = await fetchFromApi('/api/v1/products/similar', {
      type: 'suffix4',
      value: suffix4,
      limit: targetCount
    });
    if (d2?.products?.length > 0) {
      addProducts(d2.products);
    }
  }

  // Step 3: Category + Suffix2
  if (collected.length < targetCount && suffix2) {
    const d3 = await fetchFromApi('/api/v1/products/get-products', {
      category: cat.slug,
      search: { advanced: { endsWith: suffix2 } },
      limit: targetCount
    });
    if (d3?.products?.length > 0) {
      if (collected.length === 0) primarySearchJSON = { category: cat.slug, endsWith: suffix2 };
      addProducts(d3.products);
    }
  }

  // Step 4: Category pure
  if (collected.length < targetCount && cat.slug !== 'unique-numbers') {
    const d4 = await fetchFromApi('/api/v1/products/get-products', {
      category: cat.slug,
      limit: targetCount
    });
    if (d4?.products?.length > 0) {
      addProducts(d4.products);
    }
  }

  // Step 5: Website /products/similar with Suffix2
  if (collected.length < targetCount && suffix2) {
    const d5 = await fetchFromApi('/api/v1/products/similar', {
      type: 'suffix2',
      value: suffix2,
      limit: targetCount
    });
    if (d5?.products?.length > 0) {
      addProducts(d5.products);
    }
  }

  return {
    category: cat,
    products: collected,
    totalCount: collected.length,
    searchJSON: primarySearchJSON
  };
}
