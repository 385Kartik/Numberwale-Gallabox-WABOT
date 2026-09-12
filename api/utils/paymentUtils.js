/**
 * Create a Razorpay Payment Link for a specific number purchase.
 * Returns the short_url (e.g. https://rzp.io/l/abc123)
 */
export async function createRazorpayPaymentLink({ number, price, customerPhone, customerName }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing in env');
  }

  const amountPaise = Math.round(parseFloat(price) * 100); // Razorpay uses paise

  const payload = {
    amount: amountPaise,
    currency: 'INR',
    accept_partial: false,
    description: `VIP Number Purchase: ${number}`,
    customer: {
      name: customerName || 'Valued Customer',
      contact: customerPhone ? `+${customerPhone}` : undefined,
    },
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: {
      mobile_number: number,
      source: 'WhatsApp Bot'
    },
    callback_url: `${(process.env.VERCEL_URL && process.env.VERCEL_URL.startsWith('http')) ? process.env.VERCEL_URL : ('https://' + (process.env.VERCEL_URL || 'numberwale-gallabox-wabot.vercel.app'))}/api/payment-webhook`,
    callback_method: 'get'
  };

  const { default: axios } = await import('axios');
  try {
    const response = await axios.post(
      'https://api.razorpay.com/v1/payment_links',
      payload,
      {
        auth: { username: keyId, password: keySecret },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log(`[Payment] Created Razorpay link for ${number}: ${response.data.short_url}`);
    return response.data.short_url;
  } catch (err) {
    console.error('[Payment] Razorpay Link Error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.description || err.message);
  }
}

/**
 * Fetch a single product's price from the main API by mobile number.
 */
export async function fetchProductByNumber(mobileNumber) {
  const API_URL = process.env.MAIN_API_URL || 'https://api.numberwale.com';
  const { default: axios } = await import('axios');

  try {
    const response = await axios.get(`${API_URL}/api/v1/products/get-products`, {
      params: { search: { advanced: { anywhere: mobileNumber } }, limit: 1 }
    });
    const products = response.data?.products;
    if (products && products.length > 0) {
      // Find exact match
      const exact = products.find(p => p.productMobileNumber === mobileNumber) || products[0];
      return {
        number: exact.productMobileNumber,
        price: exact.pricing?.nwFinalPrice,
        basePrice: exact.pricing?.nwBasePrice?.inr,
        myDiscount: exact.pricing?.nwMyDiscount,
        vendorDiscount: exact.vendor?.vendorDiscount,
        category: exact.category?.name,
        id: exact._id,
      };
    }
    return null;
  } catch (err) {
    console.error('[Payment] fetchProductByNumber error:', err.message);
    return null;
  }
}

let cachedBotCoupons = null;
let botCouponExpiry = 0;

/**
 * Fetch all active promotional coupons configured for WhatsApp Bot from main API.
 * Uses a 5-minute in-memory cache to avoid repeated HTTP calls on every turn.
 */
export async function fetchActiveBotCoupons() {
  const now = Date.now();
  if (cachedBotCoupons !== null && now < botCouponExpiry) {
    return cachedBotCoupons;
  }

  const API_URL = process.env.MAIN_API_URL || 'https://api.numberwale.com';
  const { default: axios } = await import('axios');

  try {
    const response = await axios.get(`${API_URL}/api/v1/coupons/bot-active`, {
      timeout: 3000
    });
    
    // Support both new `coupons` array and legacy `data` single object
    let list = response.data?.coupons;
    if (!Array.isArray(list) || list.length === 0) {
      if (response.data?.data && response.data.data.code) {
        list = [response.data.data];
      } else {
        list = [];
      }
    }

    // Safety fallback: If only SPECIAL200 is returned (before server deploy updates findOne -> find),
    // ensure SPECIAL75 is also available if not already in list
    const hasSpecial200 = list.some(c => c.code === 'SPECIAL200');
    const hasSpecial75 = list.some(c => c.code === 'SPECIAL75');
    if (hasSpecial200 && !hasSpecial75) {
      list.push({
        code: 'SPECIAL75',
        description: 'Save ₹75 on any VIP number!',
        discountType: 'fixed',
        discountValue: 75,
        minOrderValue: 0,
        maxDiscount: null
      });
    }

    cachedBotCoupons = list.map(c => ({
      code: c.code,
      discountType: c.discountType, // "percentage" or "fixed"
      discountValue: c.discountValue,
      minOrderValue: c.minOrderValue || 0,
      maxDiscount: c.maxDiscount || null,
      description: c.description || ''
    }));

    botCouponExpiry = now + (5 * 60 * 1000); // Cache for 5 minutes
    return cachedBotCoupons;
  } catch (err) {
    console.warn('[Payment] fetchActiveBotCoupons error:', err.message);
    return cachedBotCoupons || [];
  }
}

/**
 * Backwards compatibility: returns primary bot coupon or null
 */
export async function fetchActiveBotCoupon() {
  const all = await fetchActiveBotCoupons();
  return (all && all.length > 0) ? all[0] : null;
}

