'use strict';
import https from 'https';
import axios from 'axios';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Offline mapping of Indian PIN code prefixes (first 2-3 digits) to State name.
 * Provides instant fallback if external India Post API is temporarily unreachable.
 */
export function getStateFromPincode(pincode) {
  if (!pincode) return null;
  const pin = String(pincode).trim().replace(/\D/g, '');
  if (pin.length !== 6) return null;

  const p3 = parseInt(pin.substring(0, 3), 10);
  const p2 = parseInt(pin.substring(0, 2), 10);

  // 1st Region - Northern
  if (p2 === 11) return 'Delhi';
  if (p2 === 12 || p2 === 13) return 'Haryana';
  if (p2 === 14 || p2 === 15) return 'Punjab';
  if (p2 === 16) return 'Chandigarh';
  if (p2 === 17) return 'Himachal Pradesh';
  if (p3 === 194) return 'Ladakh';
  if (p2 === 18 || p2 === 19) return 'Jammu & Kashmir';

  // 2nd Region - Northern (UP & Uttarakhand)
  if ([246, 248, 249, 262, 263].includes(p3)) return 'Uttarakhand';
  if (p2 >= 20 && p2 <= 28) return 'Uttar Pradesh';

  // 3rd Region - Western
  if (p2 >= 30 && p2 <= 34) return 'Rajasthan';
  if (p3 === 396) return 'Dadra and Nagar Haveli and Daman and Diu';
  if (p2 >= 36 && p2 <= 39) return 'Gujarat';

  // 4th Region - Western
  if (p3 === 403) return 'Goa';
  if (p2 >= 40 && p2 <= 44) return 'Maharashtra';
  if (p3 >= 490 && p3 <= 497) return 'Chhattisgarh';
  if (p2 >= 45 && p2 <= 49) return 'Madhya Pradesh';

  // 5th Region - Southern
  if (p3 >= 500 && p3 <= 509) return 'Telangana';
  if (p2 >= 50 && p2 <= 53) return 'Andhra Pradesh';
  if (p2 >= 56 && p2 <= 59) return 'Karnataka';

  // 6th Region - Southern
  if (p3 === 605) return 'Puducherry';
  if (p2 >= 60 && p2 <= 64) return 'Tamil Nadu';
  if (pin.startsWith('68255')) return 'Lakshadweep';
  if (p2 >= 67 && p2 <= 69) return 'Kerala';

  // 7th Region - Eastern
  if (p3 === 737) return 'Sikkim';
  if (p3 === 744) return 'Andaman and Nicobar Islands';
  if (p2 >= 70 && p2 <= 74) return 'West Bengal';
  if (p2 >= 75 && p2 <= 77) return 'Odisha';
  if (p2 === 78) return 'Assam';
  if (p3 >= 790 && p3 <= 792) return 'Arunachal Pradesh';
  if (p3 >= 793 && p3 <= 794) return 'Meghalaya';
  if (p3 === 795) return 'Manipur';
  if (p3 === 796) return 'Mizoram';
  if (p3 >= 797 && p3 <= 798) return 'Nagaland';
  if (p3 === 799) return 'Tripura';

  // 8th Region - Eastern
  if (p3 >= 814 && p3 <= 835) return 'Jharkhand';
  if (p2 >= 80 && p2 <= 85) return 'Bihar';

  return null;
}

/**
 * Validate a 6-digit Indian PIN code using India Post API (https://api.postalpincode.in/pincode/{pincode}).
 * Returns { isValid, pinCode, city, state, district, postOffice, locationDisplay, reason, message }
 */
export async function validateIndianPincode(rawPin) {
  if (!rawPin) {
    return { isValid: false, reason: 'missing', message: 'PIN code is required' };
  }

  const cleanPin = String(rawPin).replace(/\D/g, '').trim();

  // Basic format validation: exactly 6 digits, first digit 1-9
  if (!/^[1-9]\d{5}$/.test(cleanPin)) {
    return { 
      isValid: false, 
      reason: 'format_error', 
      pinCode: cleanPin, 
      message: 'PIN code must be a 6-digit number starting with 1-9' 
    };
  }

  // 1. Check with India Post public API
  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      httpsAgent,
      timeout: 4500
    });

    const data = res.data;
    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      if (result.Status === 'Success' && Array.isArray(result.PostOffice) && result.PostOffice.length > 0) {
        // Preferred: post office with delivery status 'Delivery'
        const po = result.PostOffice.find(p => p.DeliveryStatus === 'Delivery') || result.PostOffice[0];
        const district = po.District || po.Name || '';
        const state = po.State || '';
        const postOffice = po.Name || '';
        const city = district || po.Division || po.Name || '';
        const locationDisplay = city ? (city.toLowerCase() !== state.toLowerCase() ? `${city}, ${state}` : state) : state;

        return {
          isValid: true,
          pinCode: cleanPin,
          city,
          state,
          district,
          postOffice,
          locationDisplay
        };
      } else {
        // Explicit failure from India Post: No records found / Error
        return {
          isValid: false,
          reason: 'not_found',
          pinCode: cleanPin,
          message: result.Message || 'Invalid PIN code. No records found in India Post.'
        };
      }
    }
  } catch (err) {
    console.warn(`[PincodeValidator] India Post API request failed (${err.message}). Checking offline database...`);
  }

  // 2. Fallback: Offline validation via Indian postal prefix table
  const fallbackState = getStateFromPincode(cleanPin);
  if (fallbackState) {
    return {
      isValid: true,
      pinCode: cleanPin,
      city: fallbackState,
      state: fallbackState,
      district: fallbackState,
      postOffice: null,
      locationDisplay: fallbackState,
      isFallback: true
    };
  }

  return {
    isValid: false,
    reason: 'invalid_range',
    pinCode: cleanPin,
    message: 'Invalid PIN code. Number does not match any valid Indian postal circle.'
  };
}
