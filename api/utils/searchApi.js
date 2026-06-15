import axios from 'axios';

export async function fetchNumbers(jsonQuery, page = 1) {
  const API_URL = process.env.MAIN_API_URL || 'https://api.numberwale.com';
  const PAGE_SIZE = 5; // Show 5 per WhatsApp message
  try {
    console.log(`[Search] AI JSON Output:`, jsonQuery);
    
    // Map AI JSON to the exact structure the backend expects
    const searchParams = {};
    const advancedFields = {};
    
    if (jsonQuery.startsWith) advancedFields.startsWith = jsonQuery.startsWith;
    if (jsonQuery.endsWith) advancedFields.endsWith = jsonQuery.endsWith;
    if (jsonQuery.anywhere) advancedFields.anywhere = jsonQuery.anywhere;
    if (jsonQuery.mustContain) advancedFields.mustContain = jsonQuery.mustContain;
    if (jsonQuery.notContain) advancedFields.notContain = jsonQuery.notContain;
    if (jsonQuery.literSum) advancedFields.literSum = Number(jsonQuery.literSum);
    if (jsonQuery.trapSum) advancedFields.trapSum = Number(jsonQuery.trapSum);
    if (jsonQuery.scoreSum) advancedFields.scoreSum = Number(jsonQuery.scoreSum);
    if (jsonQuery.exactDigitPlacement) advancedFields.exactDigitPlacement = jsonQuery.exactDigitPlacement;
    
    if (jsonQuery.mostContainDigit && jsonQuery.mostContainCount) {
        advancedFields.mostContain = { digit: String(jsonQuery.mostContainDigit), count: Number(jsonQuery.mostContainCount) };
    }
    
    for (let i = 1; i <= 10; i++) {
      if (jsonQuery[`digitFreq${i}Digit`] && jsonQuery[`digitFreq${i}Count`]) {
        advancedFields[`digitFreq${i}Digit`] = String(jsonQuery[`digitFreq${i}Digit`]);
        advancedFields[`digitFreq${i}Count`] = Number(jsonQuery[`digitFreq${i}Count`]);
      }
    }
    
    if (Object.keys(advancedFields).length > 0) {
      searchParams.advanced = advancedFields;
    }
    
    if (jsonQuery.minPrice && jsonQuery.maxPrice) {
      searchParams.priceRange = `${jsonQuery.minPrice}-${jsonQuery.maxPrice}`;
    } else if (jsonQuery.minPrice) {
      searchParams.priceRange = `${jsonQuery.minPrice}-1000000`;
    } else if (jsonQuery.maxPrice) {
      searchParams.priceRange = `0-${jsonQuery.maxPrice}`;
    }
    
    const finalQuery = { 
      search: searchParams,
      page: page,
      limit: PAGE_SIZE
    };
    
    if (jsonQuery.category) {
      finalQuery.category = jsonQuery.category;
    }
    
    console.log(`[Search] Querying ${API_URL}/api/v1/products/get-products with mapped params:`, finalQuery);
    
    const response = await axios.get(`${API_URL}/api/v1/products/get-products`, {
      params: finalQuery
    });
    
    // The response structure from get-products is usually:
    // { metadata: { totalCount: ... }, products: [...] }
    
    if (response.data && Array.isArray(response.data.products)) {
      return {
        products: response.data.products,
        totalCount: response.data.metadata?.totalCount || 0,
        totalPages: response.data.metadata?.totalPages || 1,
        currentPage: response.data.metadata?.currentPage || page,
      };
    } else {
      console.error("[Search] API returned unexpected data format", response.data);
      return { products: [], totalCount: 0, totalPages: 0, currentPage: page };
    }
  } catch (error) {
    console.error("[Search] Error fetching numbers from main server:", error.message);
    return { products: [], totalCount: 0, totalPages: 0, currentPage: page };
  }
}

export function formatNumbersReply(products, totalCount = 0, currentPage = 1, totalPages = 1) {
  if (!products || products.length === 0) {
    return "Sorry, abhi aapki requirement ke hisaab se koi number available nahi hai. Kuch aur try kariye! 🙏";
  }

  let reply = `✨ *${totalCount} numbers found!* (Page ${currentPage}/${totalPages})\n`;
  reply += `━━━━━━━━━━━━━━━━━\n\n`;

  products.forEach((p, index) => {
    const number = p.productMobileNumber || 'N/A';
    const price = p.pricing?.nwFinalPrice || null;
    const categoryName = p.category?.name || null;
    const brand = p.productBrand || null;
    const liters = p.liters ?? null;
    const trap = p.trap ?? null;
    const score = p.score ?? null;

    reply += `*${index + 1}. ${number}*\n`;

    if (categoryName) reply += `   📂 ${categoryName}\n`;
    if (brand)        reply += `   📶 ${brand}\n`;
    if (price)        reply += `   💰 ₹${price.toLocaleString('en-IN')}\n`;

    const numsLine = [];
    if (liters !== null) numsLine.push(`Sum: ${liters}`);
    if (trap !== null)   numsLine.push(`Mid: ${trap}`);
    if (score !== null)  numsLine.push(`Total: ${score}`);
    if (numsLine.length > 0) reply += `   🔢 ${numsLine.join(' | ')}\n`;

    reply += '\n';
  });

  reply += `━━━━━━━━━━━━━━━━━\n`;

  if (currentPage < totalPages) {
    reply += `📄 Reply *"show more"* to see next ${Math.min(5, totalCount - currentPage * 5)} numbers\n`;
  }

  reply += `🛒 To buy, visit *www.numberwale.com* or reply with the number!`;

  return reply;
}
