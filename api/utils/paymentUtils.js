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

/**
 * Fetch customer's active orders and purchased VIP numbers from CRM.
 */
export async function fetchCustomerOrders(customerPhone) {
  if (!customerPhone) return { hasOrders: false, orders: [], purchasedNumbers: [], activeProducts: [], pendingPaymentOrders: [], pendingPaymentNumbers: [], pendingPaymentProducts: [], numerologyReports: [] };
  const cleanPhone = String(customerPhone).replace(/\D/g, '');
  if (!cleanPhone) return { hasOrders: false, orders: [], purchasedNumbers: [], activeProducts: [], pendingPaymentOrders: [], pendingPaymentNumbers: [], pendingPaymentProducts: [], numerologyReports: [] };

  const API_URL = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
  const ADMIN_SECRET = process.env.ADMIN_BOT_SECRET || process.env.ADMIN_SECRET || '';
  const { default: axios } = await import('axios');

  try {
    const response = await axios.get(`${API_URL}/api/v1/gallabox-bot/customer-orders`, {
      params: { phone: cleanPhone },
      headers: {
        'x-bot-secret': ADMIN_SECRET
      },
      timeout: 4000
    });

    if (response.data && response.data.status === 'success') {
      const rawOrders = response.data.orders || [];
      const rawPending = response.data.pendingPaymentOrders || [];
      const numerologyReports = response.data.numerologyReports || [];
      
      const confirmedOrders = [];
      const pendingPaymentOrders = [];
      const purchasedNumbers = [];
      const activeProducts = [];
      const pendingPaymentNumbers = [];
      const pendingPaymentProducts = [];

      // Combine raw orders and pending orders, then strictly categorize by payment status
      const allOrders = [...rawOrders, ...rawPending];
      // Deduplicate orders by orderNumber
      const seenOrderNumbers = new Set();
      const uniqueOrders = allOrders.filter(o => {
        if (!o.orderNumber || seenOrderNumbers.has(o.orderNumber)) return false;
        seenOrderNumbers.add(o.orderNumber);
        return true;
      });

      for (const ord of uniqueOrders) {
        const rawPayStatus = String(ord.paymentStatus || '').toLowerCase();
        const isPaid = (ord.isPaymentConfirmed === true || rawPayStatus === 'completed' || rawPayStatus === 'paid') &&
          rawPayStatus !== 'pending' && rawPayStatus !== 'failed' && rawPayStatus !== 'cancelled';

        if (isPaid) {
          confirmedOrders.push(ord);
          for (const prod of (ord.products || [])) {
            if (prod.number) {
              const raw10 = String(prod.number).replace(/\D/g, '').slice(-10);
              purchasedNumbers.push(raw10);
              activeProducts.push({
                ...prod,
                number: raw10,
                orderNumber: ord.orderNumber,
                invoiceNumber: ord.invoiceNumber || prod.invoiceNumber || null,
                pdfUrl: prod.pdfUrl || ord.pdfUrl || null,
                pdfFilename: (prod.pdfFilename || ord.pdfFilename || '').replace(/[\/\\]/g, '-'),
                creditNote: prod.creditNote || null,
                creditNotePdfUrl: prod.creditNotePdfUrl || prod.creditNote?.pdfUrl || null,
                creditNotePdfFilename: (prod.creditNotePdfFilename || prod.creditNote?.pdfFilename || '').replace(/[\/\\]/g, '-'),
                orderStatus: ord.orderStatus,
                paymentStatus: 'completed',
                isPaid: true,
                createdAt: ord.createdAt
              });
            }
          }
        } else {
          // Unpaid / pending payment order
          pendingPaymentOrders.push(ord);
          for (const prod of (ord.products || [])) {
            if (prod.number) {
              const raw10 = String(prod.number).replace(/\D/g, '').slice(-10);
              pendingPaymentNumbers.push(raw10);
              pendingPaymentProducts.push({
                ...prod,
                number: raw10,
                orderNumber: ord.orderNumber,
                orderStatus: ord.orderStatus,
                paymentStatus: ord.paymentStatus || 'pending',
                isPaid: false,
                createdAt: ord.createdAt
              });
            }
          }
        }
      }

      return {
        hasOrders: purchasedNumbers.length > 0 || numerologyReports.length > 0,
        customerName: response.data.customerName || null,
        orders: confirmedOrders,
        purchasedNumbers: [...new Set(purchasedNumbers)],
        activeProducts,
        pendingPaymentOrders,
        pendingPaymentNumbers: [...new Set(pendingPaymentNumbers)],
        pendingPaymentProducts,
        numerologyReports
      };
    }
    return { hasOrders: false, orders: [], purchasedNumbers: [], activeProducts: [], pendingPaymentOrders: [], pendingPaymentNumbers: [], pendingPaymentProducts: [], numerologyReports: [] };
  } catch (err) {
    console.warn('[Orders] fetchCustomerOrders warning:', err.response?.data?.message || err.message);
    return { hasOrders: false, orders: [], purchasedNumbers: [], activeProducts: [], pendingPaymentOrders: [], pendingPaymentNumbers: [], pendingPaymentProducts: [], numerologyReports: [] };
  }
}

