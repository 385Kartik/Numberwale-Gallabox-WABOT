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
