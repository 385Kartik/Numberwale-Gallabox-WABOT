import { getMatchingBotCoupon } from '../api/utils/paymentUtils.js';
import { buildSystemPrompt } from '../api/utils/aiAgent.js';

const mockCoupons = [
  { code: 'SPECIAL75', discountType: 'flat', discountValue: 75, minOrderValue: 0, maxOrderValue: 2000 },
  { code: 'SPECIAL100', discountType: 'flat', discountValue: 100, minOrderValue: 2001, maxOrderValue: 14999 },
  { code: 'SPECIAL300', discountType: 'flat', discountValue: 300, minOrderValue: 15000, maxOrderValue: null },
];

console.log('--- TEST 1: Match Slabs Correctly ---');
const match1 = getMatchingBotCoupon(mockCoupons, 1500);
console.log('Price ₹1,500 matched:', match1?.code);
if (match1?.code !== 'SPECIAL75') throw new Error(`Expected SPECIAL75, got ${match1?.code}`);

const match2 = getMatchingBotCoupon(mockCoupons, 5000);
console.log('Price ₹5,000 matched:', match2?.code);
if (match2?.code !== 'SPECIAL100') throw new Error(`Expected SPECIAL100, got ${match2?.code}`);

const match3 = getMatchingBotCoupon(mockCoupons, 25000);
console.log('Price ₹25,000 matched:', match3?.code);
if (match3?.code !== 'SPECIAL300') throw new Error(`Expected SPECIAL300, got ${match3?.code}`);

console.log('--- TEST 2: Boundary Tests ---');
const matchBoundary1 = getMatchingBotCoupon(mockCoupons, 2000);
console.log('Price ₹2,000 matched:', matchBoundary1?.code);
if (matchBoundary1?.code !== 'SPECIAL75') throw new Error(`Expected SPECIAL75, got ${matchBoundary1?.code}`);

const matchBoundary2 = getMatchingBotCoupon(mockCoupons, 2001);
console.log('Price ₹2,001 matched:', matchBoundary2?.code);
if (matchBoundary2?.code !== 'SPECIAL100') throw new Error(`Expected SPECIAL100, got ${matchBoundary2?.code}`);

const matchBoundary3 = getMatchingBotCoupon(mockCoupons, 15000);
console.log('Price ₹15,000 matched:', matchBoundary3?.code);
if (matchBoundary3?.code !== 'SPECIAL300') throw new Error(`Expected SPECIAL300, got ${matchBoundary3?.code}`);

console.log('--- TEST 3: System Prompt Generation ---');
const ctx = {
  customerPhone: '919876543210',
  customerName: 'Rahul',
  activeCoupons: mockCoupons,
  activeFilters: { maxPrice: 15000 },
  targetProduct: {
    number: '9876500181',
    totalWithGst: 18000,
    price: 15254,
    category: 'VIP Fancy Number',
  }
};

const prompt = buildSystemPrompt(ctx);
if (prompt.includes('SPECIAL200')) {
  throw new Error('Found hardcoded SPECIAL200 in prompt!');
}
if (!prompt.includes('*SPECIAL300*')) {
  throw new Error('Expected target product of ₹18,000 to recommend *SPECIAL300*!');
}
if (!prompt.includes('CUSTOMER BUDGET DETECTED AS ₹15,000')) {
  throw new Error('Expected customer budget detection in prompt!');
}
console.log('Prompt successfully verified! Target product ₹18,000 receives SPECIAL300, no obsolete SPECIAL200 found.');

console.log('--- TEST 4: Subtotal vs GST Evaluation (e.g. 636 636 4500 - Subtotal ₹4,680, Total with GST ₹5,522) ---');
const productionSlabs = [
  { code: 'SPECIAL75', discountType: 'flat', discountValue: 75, minOrderValue: 0, maxOrderValue: 2000 },
  { code: 'SPECIAL100', discountType: 'flat', discountValue: 100, minOrderValue: 2001, maxOrderValue: 5000 },
  { code: 'SPECIAL200', discountType: 'flat', discountValue: 200, minOrderValue: 5001, maxOrderValue: 14999 },
  { code: 'SPECIAL300', discountType: 'flat', discountValue: 300, minOrderValue: 15000, maxOrderValue: null },
];

const ctxCartSubtotal = {
  customerPhone: '919876543210',
  customerName: 'Kartik',
  activeCoupons: productionSlabs,
  targetProduct: {
    number: '6366364500',
    formattedNumber: '636 636 4500',
    price: 4680,
    subtotal: 4680,
    totalWithGst: 5522,
    category: 'VIP Fancy Number'
  }
};

const promptSubtotal = buildSystemPrompt(ctxCartSubtotal);

if (!promptSubtotal.includes('Cart Subtotal (Base price before GST): ₹4,680')) {
  throw new Error('Prompt missing Cart Subtotal before GST!');
}
if (!promptSubtotal.includes('EXACT Total Price: ₹5,522 (includes 18% GST and official GST invoice)')) {
  throw new Error('Prompt missing Total Price with GST!');
}
if (!promptSubtotal.includes('*SPECIAL100*')) {
  throw new Error('Expected coupon *SPECIAL100* for subtotal ₹4,680!');
}
if (promptSubtotal.includes('offer them our exclusive coupon code for this slab: *SPECIAL200*')) {
  throw new Error('BUG: Offered SPECIAL200 for subtotal ₹4,680! Coupons must be evaluated on Subtotal, not GST total!');
}
console.log('Subtotal vs GST test PASSED! ₹4,680 subtotal accurately receives SPECIAL100, rejecting SPECIAL200. ✅');

console.log('\nAll coupon slab unit tests passed successfully! ✅');
