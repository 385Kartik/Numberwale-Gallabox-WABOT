// const escapeRegex = (str) => {
//     if (!str || typeof str !== 'string') return '';
//     const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\' + '$&');
    
//     // Log escaping for debugging
//     if (str !== escaped) {
//         console.log(`[REGEX ESCAPE] Input: "${str}" => Output: "${escaped}"`);
//     }
    
//     return escaped;
// };

// export const buildAdvancedSearchQuery = (searchParams = {}) => {
//     console.log('\n========================================');
//     console.log('🔍 ADVANCED SEARCH QUERY BUILDER');
//     console.log('========================================');
//     console.log('📥 Input searchParams:', searchParams ? JSON.stringify(searchParams, null, 2) : 'none');
    
//     if (!searchParams || Object.keys(searchParams).length === 0) {
//         console.log('⚠️  No search params provided, returning empty query');
//         return {};
//     }

//     const conditions = [];
//     const MAX_CONDITIONS = 10; // Increased since we're using more efficient patterns now

//     try {
//         // Global Search - Simple string contains
//         if (searchParams.globalSearch) {
//             console.log('\n📌 Processing GLOBAL SEARCH');
//             console.log('   📥 Input:', searchParams.globalSearch);
            
//             // Extract only digits from input
//             const cleanInput = searchParams.globalSearch.replace(/\D/g, '');
            
//             // Only proceed if we have digits
//             if (!cleanInput || cleanInput.length === 0) {
//                 console.log('   ⚠️  No digits found in search input, skipping');
//             } else if (cleanInput.length === 10) {
//                 console.log('   ✅ Exact 10-digit match:', cleanInput);
//                 const condition = { productMobileNumber: cleanInput };
//                 conditions.push(condition);
//                 console.log('   ✅ Added exact match condition');
//             } else {
//                 console.log('   ✅ Partial digit search:', cleanInput);
//                 // For partial searches, use regex on cleaned digits
//                 const escapedSearch = escapeRegex(cleanInput);
//                 const condition = {
//                     productMobileNumber: { $regex: escapedSearch, $options: 'i' }
//                 };
//                 conditions.push(condition);
//                 console.log('   ✅ Added regex condition:', escapedSearch);
//             }
//         }

//         // Premium Search
//         if (searchParams.premium) {
//             console.log('\n📌 Processing PREMIUM SEARCH');
//             const { startsWith, endsWith, anywhere } = searchParams.premium;
            
//             if (startsWith) {
//                 console.log('    Starts With:', startsWith);
//                 const cleanInput = startsWith.replace(/\D/g, '');
                
//                 // Use simple string comparison for startsWith
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `^${escapeRegex(cleanInput)}`,
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added startsWith condition');
//             }
            
//             if (endsWith) {
//                 console.log('    Ends With:', endsWith);
//                 const cleanInput = endsWith.replace(/\D/g, '');
                
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `${escapeRegex(cleanInput)}$`,
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added endsWith condition');
//             }
            
//             if (anywhere) {
//                 console.log('    Anywhere:', anywhere);
//                 const cleanInput = anywhere.replace(/\D/g, '');
                
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: escapeRegex(cleanInput),
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added anywhere condition');
//             }
//         }

//         // Advanced Search
//         if (searchParams.advanced) {
//             console.log('\n📌 Processing ADVANCED SEARCH');
//             const {
//                 startsWith,
//                 endsWith,
//                 anywhere,
//                 mustContain,
//                 notContain,
//                 literSum,
//                 trapSum,
//                 scoreSum,
//                 exactDigitPlacement,
//                 mostContain
//             } = searchParams.advanced;

//             if (startsWith) {
//                 console.log('    Starts With:', startsWith);
//                 const cleanInput = startsWith.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `^${escapeRegex(cleanInput)}` 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (endsWith) {
//                 console.log('    Ends With:', endsWith);
//                 const cleanInput = endsWith.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `${escapeRegex(cleanInput)}$` 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (anywhere) {
//                 console.log('    Anywhere:', anywhere);
//                 const cleanInput = anywhere.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: escapeRegex(cleanInput) 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (mustContain) {
//                 console.log('    Must Contain:', mustContain);
//                 const digits = mustContain
//                     .split(",")
//                     .map(s => s.trim())
//                     .filter(Boolean)
//                     .flatMap(s => s.split('').filter(d => /\d/.test(d)))
//                     .slice(0, 5); // Limit to 5 digits max
                
//                 console.log('    Parsed digits (limited to 5):', digits);
                
//                 if (digits.length > 0) {
//                     // Build a regex pattern that ensures ALL digits are present
//                     // Using positive lookahead for each digit
//                     const lookaheadPattern = digits.map(digit => `(?=.*${escapeRegex(digit)})`).join('');
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${lookaheadPattern}.*$`
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log(`    Added mustContain condition for digits: ${digits.join(', ')}`);
//                     console.log(`    Pattern: ^${lookaheadPattern}.*$`);
//                 }
//             }

//             if (notContain) {
//                 console.log('    Not Contain:', notContain);
//                 const digits = notContain
//                     .split(",")
//                     .map(s => s.trim())
//                     .filter(Boolean)
//                     .flatMap(s => s.split('').filter(d => /\d/.test(d)))
//                     .slice(0, 5); // Limit to 5 digits max
                
//                 console.log('    Parsed digits (limited to 5):', digits);
                
//                 if (digits.length > 0) {
//                     // Build a regex pattern that ensures NONE of the digits are present
//                     // Using negative lookahead for each digit
//                     const negativeLookaheadPattern = digits.map(digit => `(?!.*${escapeRegex(digit)})`).join('');
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${negativeLookaheadPattern}.*$`
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log(`    Added notContain condition for digits: ${digits.join(', ')}`);
//                     console.log(`    Pattern: ^${negativeLookaheadPattern}.*$`);
//                 }
//             }

//             if (literSum) {
//                 console.log('    Liter Sum:', literSum);
//                 const condition = { liters: Number(literSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (trapSum) {
//                 console.log('    Trap Sum:', trapSum);
//                 const condition = { trap: Number(trapSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (scoreSum) {
//                 console.log('    Score Sum:', scoreSum);
//                 const condition = { score: Number(scoreSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (exactDigitPlacement) {
//                 console.log('    Exact Digit Placement:', exactDigitPlacement);
                
//                 // Clean input - only keep digits and ?
//                 const cleanPattern = exactDigitPlacement.replace(/[^\d?]/g, '');
                
//                 if (cleanPattern.length === 10) {
//                     // Convert ? to \d for regex
//                     const regexPattern = cleanPattern
//                         .split('')
//                         .map(char => char === '?' ? '\\d' : escapeRegex(char))
//                         .join('');
                    
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${regexPattern}$` 
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log('    Pattern:', regexPattern);
//                     console.log('    Added condition');
//                 } else {
//                     console.warn(`     Invalid pattern length: ${cleanPattern.length} (expected 10)`);
//                 }
//             }

//             if (mostContain?.digit && mostContain?.count) {
//                 console.log('⚠️  mostContain feature DISABLED due to performance/security concerns');
//                 console.log('    Requested - Digit:', mostContain.digit, 'Count:', mostContain.count);
//                 console.log('    This feature causes catastrophic regex backtracking and server crashes');
//                 // Feature disabled - do not add condition
//             }
//         }

//         // Check if we exceeded max conditions
//         if (conditions.length > MAX_CONDITIONS) {
//             console.warn(`⚠️  Too many conditions (${conditions.length}). Limiting to ${MAX_CONDITIONS}`);
//             conditions.splice(MAX_CONDITIONS);
//         }

//         const finalQuery = conditions.length > 0 ? { $and: conditions } : {};
        
//         console.log('\n========================================');
//         console.log('📊 FINAL MONGODB QUERY');
//         console.log('========================================');
//         console.log('Total Conditions:', conditions.length);
//         console.log('Max Allowed:', MAX_CONDITIONS);
//         console.log(JSON.stringify(finalQuery, null, 2));
//         console.log('========================================\n');
        
//         return finalQuery;
//     } catch (error) {
//         console.error('\n ERROR in buildAdvancedSearchQuery:');
//         console.error('   Message:', error.message);
//         console.error('   Stack:', error.stack);
//         console.error('   Search Params:', JSON.stringify(searchParams, null, 2));
//         console.log('========================================\n');
//         return {};
//     }
// };
//==============================================================================
// const escapeRegex = (str) => {
//     if (!str || typeof str !== 'string') return '';
//     const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\' + '$&');
    
//     // Log escaping for debugging
//     if (str !== escaped) {
//         console.log(`[REGEX ESCAPE] Input: "${str}" => Output: "${escaped}"`);
//     }
    
//     return escaped;
// };

// export const buildAdvancedSearchQuery = (searchParams = {}) => {
//     console.log('\n========================================');
//     console.log('🔍 ADVANCED SEARCH QUERY BUILDER');
//     console.log('========================================');
//     console.log('📥 Input searchParams:', searchParams ? JSON.stringify(searchParams, null, 2) : 'none');
    
//     if (!searchParams || Object.keys(searchParams).length === 0) {
//         console.log('⚠️  No search params provided, returning empty query');
//         return {};
//     }

//     const conditions = [];
//     const MAX_CONDITIONS = 10; // Increased since we're using more efficient patterns now

//     try {
//         // Global Search - Simple string contains
//         if (searchParams.globalSearch) {
//             console.log('\n📌 Processing GLOBAL SEARCH');
//             console.log('   📥 Input:', searchParams.globalSearch);
            
//             // Extract only digits from input
//             const cleanInput = searchParams.globalSearch.replace(/\D/g, '');
            
//             // Only proceed if we have digits
//             if (!cleanInput || cleanInput.length === 0) {
//                 console.log('   ⚠️  No digits found in search input, skipping');
//             } else if (cleanInput.length === 10) {
//                 console.log('   ✅ Exact 10-digit match:', cleanInput);
//                 const condition = { productMobileNumber: cleanInput };
//                 conditions.push(condition);
//                 console.log('   ✅ Added exact match condition');
//             } else {
//                 console.log('   ✅ Partial digit search:', cleanInput);
//                 // For partial searches, use regex on cleaned digits
//                 const escapedSearch = escapeRegex(cleanInput);
//                 const condition = {
//                     productMobileNumber: { $regex: escapedSearch, $options: 'i' }
//                 };
//                 conditions.push(condition);
//                 console.log('   ✅ Added regex condition:', escapedSearch);
//             }
//         }

//         // Premium Search
//         if (searchParams.premium) {
//             console.log('\n📌 Processing PREMIUM SEARCH');
//             const { startsWith, endsWith, anywhere } = searchParams.premium;
            
//             if (startsWith) {
//                 console.log('    Starts With:', startsWith);
//                 const cleanInput = startsWith.replace(/\D/g, '');
                
//                 // Use simple string comparison for startsWith
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `^${escapeRegex(cleanInput)}`,
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added startsWith condition');
//             }
            
//             if (endsWith) {
//                 console.log('    Ends With:', endsWith);
//                 const cleanInput = endsWith.replace(/\D/g, '');
                
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `${escapeRegex(cleanInput)}$`,
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added endsWith condition');
//             }
            
//             if (anywhere) {
//                 console.log('    Anywhere:', anywhere);
//                 const cleanInput = anywhere.replace(/\D/g, '');
                
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: escapeRegex(cleanInput),
//                         $options: 'i' 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added anywhere condition');
//             }
//         }

//         // Advanced Search
//         if (searchParams.advanced) {
//             console.log('\n📌 Processing ADVANCED SEARCH');
//             const {
//                 startsWith,
//                 endsWith,
//                 anywhere,
//                 mustContain,
//                 notContain,
//                 literSum,
//                 trapSum,
//                 scoreSum,
//                 exactDigitPlacement,
//                 mostContain
//             } = searchParams.advanced;

//             if (startsWith) {
//                 console.log('    Starts With:', startsWith);
//                 const cleanInput = startsWith.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `^${escapeRegex(cleanInput)}` 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (endsWith) {
//                 console.log('    Ends With:', endsWith);
//                 const cleanInput = endsWith.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: `${escapeRegex(cleanInput)}$` 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (anywhere) {
//                 console.log('    Anywhere:', anywhere);
//                 const cleanInput = anywhere.replace(/\D/g, '');
//                 const condition = { 
//                     productMobileNumber: { 
//                         $regex: escapeRegex(cleanInput) 
//                     } 
//                 };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (mustContain) {
//                 console.log('    Must Contain:', mustContain);
//                 const digits = mustContain
//                     .split(",")
//                     .map(s => s.trim())
//                     .filter(Boolean)
//                     .flatMap(s => s.split('').filter(d => /\d/.test(d)))
//                     .slice(0, 5); // Limit to 5 digits max
                
//                 console.log('    Parsed digits (limited to 5):', digits);
                
//                 if (digits.length > 0) {
//                     // Build a regex pattern that ensures ALL digits are present
//                     // Using positive lookahead for each digit
//                     const lookaheadPattern = digits.map(digit => `(?=.*${escapeRegex(digit)})`).join('');
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${lookaheadPattern}.*$`
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log(`    Added mustContain condition for digits: ${digits.join(', ')}`);
//                     console.log(`    Pattern: ^${lookaheadPattern}.*$`);
//                 }
//             }

//             if (notContain) {
//                 console.log('    Not Contain:', notContain);
//                 const digits = notContain
//                     .split(",")
//                     .map(s => s.trim())
//                     .filter(Boolean)
//                     .flatMap(s => s.split('').filter(d => /\d/.test(d)))
//                     .slice(0, 5); // Limit to 5 digits max
                
//                 console.log('    Parsed digits (limited to 5):', digits);
                
//                 if (digits.length > 0) {
//                     // Build a regex pattern that ensures NONE of the digits are present
//                     // Using negative lookahead for each digit
//                     const negativeLookaheadPattern = digits.map(digit => `(?!.*${escapeRegex(digit)})`).join('');
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${negativeLookaheadPattern}.*$`
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log(`    Added notContain condition for digits: ${digits.join(', ')}`);
//                     console.log(`    Pattern: ^${negativeLookaheadPattern}.*$`);
//                 }
//             }

//             if (literSum) {
//                 console.log('    Liter Sum:', literSum);
//                 const condition = { liters: Number(literSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (trapSum) {
//                 console.log('    Trap Sum:', trapSum);
//                 const condition = { trap: Number(trapSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (scoreSum) {
//                 console.log('    Score Sum:', scoreSum);
//                 const condition = { score: Number(scoreSum) };
//                 conditions.push(condition);
//                 console.log('    Added condition');
//             }

//             if (exactDigitPlacement) {
//                 console.log('    Exact Digit Placement:', exactDigitPlacement);
                
//                 // Clean input - only keep digits and ?
//                 const cleanPattern = exactDigitPlacement.replace(/[^\d?]/g, '');
                
//                 if (cleanPattern.length === 10) {
//                     // Convert ? to \d for regex
//                     const regexPattern = cleanPattern
//                         .split('')
//                         .map(char => char === '?' ? '\\d' : escapeRegex(char))
//                         .join('');
                    
//                     const condition = { 
//                         productMobileNumber: { 
//                             $regex: `^${regexPattern}$` 
//                         } 
//                     };
//                     conditions.push(condition);
//                     console.log('    Pattern:', regexPattern);
//                     console.log('    Added condition');
//                 } else {
//                     console.warn(`     Invalid pattern length: ${cleanPattern.length} (expected 10)`);
//                 }
//             }

//             if (mostContain?.digit && mostContain?.count) {
//                 console.log('⚠️  mostContain feature DISABLED due to performance/security concerns');
//                 console.log('    Requested - Digit:', mostContain.digit, 'Count:', mostContain.count);
//                 console.log('    This feature causes catastrophic regex backtracking and server crashes');
//                 // Feature disabled - do not add condition
//             }

//             // Digit Frequency - Using safe regex patterns
//             if (searchParams.advanced.digitFreq1Digit && searchParams.advanced.digitFreq1Count) {
//                 const digit1 = searchParams.advanced.digitFreq1Digit.toString().trim();
//                 const count1 = parseInt(searchParams.advanced.digitFreq1Count);
                
//                 if (/^\d$/.test(digit1) && count1 >= 1 && count1 <= 10) {
//                     console.log('    Digit Frequency 1 - Digit:', digit1, 'Count:', count1);
                    
//                     // Build a safe regex pattern: digit must appear at least 'count' times
//                     // Pattern: (?=(?:.*digit){count}) - uses lookahead to count occurrences
//                     const pattern = `(?=(?:.*${escapeRegex(digit1)}){${count1}})`;
//                     const condition = {
//                         productMobileNumber: { 
//                             $regex: pattern,
//                             $options: 'i' 
//                         }
//                     };
//                     conditions.push(condition);
//                     console.log('    Added digitFreq1 condition with pattern:', pattern);
//                 }
//             }

//             if (searchParams.advanced.digitFreq2Digit && searchParams.advanced.digitFreq2Count) {
//                 const digit2 = searchParams.advanced.digitFreq2Digit.toString().trim();
//                 const count2 = parseInt(searchParams.advanced.digitFreq2Count);
                
//                 if (/^\d$/.test(digit2) && count2 >= 1 && count2 <= 10) {
//                     console.log('    Digit Frequency 2 - Digit:', digit2, 'Count:', count2);
                    
//                     const pattern = `(?=(?:.*${escapeRegex(digit2)}){${count2}})`;
//                     const condition = {
//                         productMobileNumber: { 
//                             $regex: pattern,
//                             $options: 'i' 
//                         }
//                     };
//                     conditions.push(condition);
//                     console.log('    Added digitFreq2 condition with pattern:', pattern);
//                 }
//             }
//         }

//         // Check if we exceeded max conditions
//         if (conditions.length > MAX_CONDITIONS) {
//             console.warn(`⚠️  Too many conditions (${conditions.length}). Limiting to ${MAX_CONDITIONS}`);
//             conditions.splice(MAX_CONDITIONS);
//         }

//         const finalQuery = conditions.length > 0 ? { $and: conditions } : {};
        
//         console.log('\n========================================');
//         console.log('📊 FINAL MONGODB QUERY');
//         console.log('========================================');
//         console.log('Total Conditions:', conditions.length);
//         console.log('Max Allowed:', MAX_CONDITIONS);
//         console.log(JSON.stringify(finalQuery, null, 2));
//         console.log('========================================\n');
        
//         return finalQuery;
//     } catch (error) {
//         console.error('\n ERROR in buildAdvancedSearchQuery:');
//         console.error('   Message:', error.message);
//         console.error('   Stack:', error.stack);
//         console.error('   Search Params:', JSON.stringify(searchParams, null, 2));
//         console.log('========================================\n');
//         return {};
//     }
// };
//=============================================================================
// const escapeRegex = (str) => {
//   if (!str || typeof str !== "string") return "";
//   const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\" + "$&");
//   if (str !== escaped) {
//     console.log(`[REGEX ESCAPE] Input: "${str}" => Output: "${escaped}"`);
//   }
//   return escaped;
// };
// export const buildAdvancedSearchQuery = (searchParams = {}) => {
//   console.log("\n========================================");
//   console.log("🔍 ADVANCED SEARCH QUERY BUILDER");
//   console.log("========================================");
//   console.log(
//     "📥 Input searchParams:",
//     searchParams ? JSON.stringify(searchParams, null, 2) : "none",
//   );
//   if (!searchParams || Object.keys(searchParams).length === 0) {
//     console.log("⚠️  No search params provided, returning empty query");
//     return {};
//   }
//   const conditions = [];
//   const MAX_CONDITIONS = 10; // Increased since we're using more efficient patterns now
//   try {
//     if (searchParams.globalSearch) {
//       console.log("\n📌 Processing GLOBAL SEARCH");
//       console.log("   📥 Input:", searchParams.globalSearch);
//       const cleanInput = searchParams.globalSearch.replace(/\D/g, "");
//       if (!cleanInput || cleanInput.length === 0) {
//         console.log("   ⚠️  No digits found in search input, skipping");
//       } else if (cleanInput.length === 10) {
//         console.log("   ✅ Exact 10-digit match:", cleanInput);
//         const condition = { productMobileNumber: cleanInput };
//         conditions.push(condition);
//         console.log("   ✅ Added exact match condition");
//       } else {
//         console.log("   ✅ Partial digit search:", cleanInput);
//         const escapedSearch = escapeRegex(cleanInput);
//         const condition = {
//           productMobileNumber: { $regex: escapedSearch, $options: "i" },
//         };
//         conditions.push(condition);
//         console.log("   ✅ Added regex condition:", escapedSearch);
//       }
//     }
//     if (searchParams.premium) {
//       console.log("\n📌 Processing PREMIUM SEARCH");
//       const { startsWith, endsWith, anywhere } = searchParams.premium;
//       if (startsWith) {
//         console.log("    Starts With:", startsWith);
//         const cleanInput = startsWith.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: `^${escapeRegex(cleanInput)}`,
//             $options: "i",
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added startsWith condition");
//       }
//       if (endsWith) {
//         console.log("    Ends With:", endsWith);
//         const cleanInput = endsWith.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: `${escapeRegex(cleanInput)}$`,
//             $options: "i",
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added endsWith condition");
//       }
//       if (anywhere) {
//         console.log("    Anywhere:", anywhere);
//         const cleanInput = anywhere.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: escapeRegex(cleanInput),
//             $options: "i",
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added anywhere condition");
//       }
//     }
//     if (searchParams.advanced) {
//       console.log("\n📌 Processing ADVANCED SEARCH");
//       const {
//         startsWith,
//         endsWith,
//         anywhere,
//         mustContain,
//         notContain,
//         literSum,
//         trapSum,
//         scoreSum,
//         exactDigitPlacement,
//         mostContain,
//       } = searchParams.advanced;
//       if (startsWith) {
//         console.log("    Starts With:", startsWith);
//         const cleanInput = startsWith.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: `^${escapeRegex(cleanInput)}`,
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (endsWith) {
//         console.log("    Ends With:", endsWith);
//         const cleanInput = endsWith.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: `${escapeRegex(cleanInput)}$`,
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (anywhere) {
//         console.log("    Anywhere:", anywhere);
//         const cleanInput = anywhere.replace(/\D/g, "");
//         const condition = {
//           productMobileNumber: {
//             $regex: escapeRegex(cleanInput),
//           },
//         };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (mustContain) {
//         console.log("    Must Contain:", mustContain);
//         const digits = mustContain
//           .split(",")
//           .map((s) => s.trim())
//           .filter(Boolean)
//           .flatMap((s) => s.split("").filter((d) => /\d/.test(d)))
//           .slice(0, 5); // Limit to 5 digits max
//         console.log("    Parsed digits (limited to 5):", digits);
//         if (digits.length > 0) {
//           const lookaheadPattern = digits
//             .map((digit) => `(?=.*${escapeRegex(digit)})`)
//             .join("");
//           const condition = {
//             productMobileNumber: {
//               $regex: `^${lookaheadPattern}.*$`,
//             },
//           };
//           conditions.push(condition);
//           console.log(
//             `    Added mustContain condition for digits: ${digits.join(", ")}`,
//           );
//           console.log(`    Pattern: ^${lookaheadPattern}.*$`);
//         }
//       }
//       if (notContain) {
//         console.log("    Not Contain:", notContain);
//         const digits = notContain
//           .split(",")
//           .map((s) => s.trim())
//           .filter(Boolean)
//           .flatMap((s) => s.split("").filter((d) => /\d/.test(d)))
//           .slice(0, 5); // Limit to 5 digits max
//         console.log("    Parsed digits (limited to 5):", digits);
//         if (digits.length > 0) {
//           const negativeLookaheadPattern = digits
//             .map((digit) => `(?!.*${escapeRegex(digit)})`)
//             .join("");
//           const condition = {
//             productMobileNumber: {
//               $regex: `^${negativeLookaheadPattern}.*$`,
//             },
//           };
//           conditions.push(condition);
//           console.log(
//             `    Added notContain condition for digits: ${digits.join(", ")}`,
//           );
//           console.log(`    Pattern: ^${negativeLookaheadPattern}.*$`);
//         }
//       }
//       if (literSum) {
//         console.log("    Liter Sum:", literSum);
//         const condition = { liters: Number(literSum) };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (trapSum) {
//         console.log("    Trap Sum:", trapSum);
//         const condition = { trap: Number(trapSum) };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (scoreSum) {
//         console.log("    Score Sum:", scoreSum);
//         const condition = { score: Number(scoreSum) };
//         conditions.push(condition);
//         console.log("    Added condition");
//       }
//       if (exactDigitPlacement) {
//         console.log("    Exact Digit Placement:", exactDigitPlacement);
//         const cleanPattern = exactDigitPlacement.replace(/[^\d?]/g, "");
//         if (cleanPattern.length === 10) {
//           const regexPattern = cleanPattern
//             .split("")
//             .map((char) => (char === "?" ? "\\d" : escapeRegex(char)))
//             .join("");
//           const condition = {
//             productMobileNumber: {
//               $regex: `^${regexPattern}$`,
//             },
//           };
//           conditions.push(condition);
//           console.log("    Pattern:", regexPattern);
//           console.log("    Added condition");
//         } else {
//           console.warn(
//             `     Invalid pattern length: ${cleanPattern.length} (expected 10)`,
//           );
//         }
//       }
//       if (mostContain?.digit && mostContain?.count) {
//         console.log(
//           "⚠️  mostContain feature DISABLED due to performance/security concerns",
//         );
//         console.log(
//           "    Requested - Digit:",
//           mostContain.digit,
//           "Count:",
//           mostContain.count,
//         );
//         console.log(
//           "    This feature causes catastrophic regex backtracking and server crashes",
//         );
//       }
//       if (
//         searchParams.advanced.digitFreq1Digit &&
//         searchParams.advanced.digitFreq1Count
//       ) {
//         const digit1 = searchParams.advanced.digitFreq1Digit.toString().trim();
//         const count1 = parseInt(searchParams.advanced.digitFreq1Count);
//         if (/^\d$/.test(digit1) && count1 >= 1 && count1 <= 10) {
//           console.log(
//             "    Digit Frequency 1 - Digit:",
//             digit1,
//             "Count:",
//             count1,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit1)}){${count1}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq1 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq2Digit &&
//         searchParams.advanced.digitFreq2Count
//       ) {
//         const digit2 = searchParams.advanced.digitFreq2Digit.toString().trim();
//         const count2 = parseInt(searchParams.advanced.digitFreq2Count);
//         if (/^\d$/.test(digit2) && count2 >= 1 && count2 <= 10) {
//           console.log(
//             "    Digit Frequency 2 - Digit:",
//             digit2,
//             "Count:",
//             count2,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit2)}){${count2}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq2 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq3Digit &&
//         searchParams.advanced.digitFreq3Count
//       ) {
//         const digit3 = searchParams.advanced.digitFreq3Digit.toString().trim();
//         const count3 = parseInt(searchParams.advanced.digitFreq3Count);
//         if (/^\d$/.test(digit3) && count3 >= 1 && count3 <= 10) {
//           console.log(
//             "    Digit Frequency 3 - Digit:",
//             digit3,
//             "Count:",
//             count3,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit3)}){${count3}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq3 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq4Digit &&
//         searchParams.advanced.digitFreq4Count
//       ) {
//         const digit4 = searchParams.advanced.digitFreq4Digit.toString().trim();
//         const count4 = parseInt(searchParams.advanced.digitFreq4Count);
//         if (/^\d$/.test(digit4) && count4 >= 1 && count4 <= 10) {
//           console.log(
//             "    Digit Frequency 4 - Digit:",
//             digit4,
//             "Count:",
//             count4,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit4)}){${count4}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq4 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq5Digit &&
//         searchParams.advanced.digitFreq5Count
//       ) {
//         const digit5 = searchParams.advanced.digitFreq5Digit.toString().trim();
//         const count5 = parseInt(searchParams.advanced.digitFreq5Count);
//         if (/^\d$/.test(digit5) && count5 >= 1 && count5 <= 10) {
//           console.log(
//             "    Digit Frequency 5 - Digit:",
//             digit5,
//             "Count:",
//             count5,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit5)}){${count5}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq5 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq6Digit &&
//         searchParams.advanced.digitFreq6Count
//       ) {
//         const digit6 = searchParams.advanced.digitFreq6Digit.toString().trim();
//         const count6 = parseInt(searchParams.advanced.digitFreq6Count);
//         if (/^\d$/.test(digit6) && count6 >= 1 && count6 <= 10) {
//           console.log(
//             "    Digit Frequency 6 - Digit:",
//             digit6,
//             "Count:",
//             count6,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit6)}){${count6}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq6 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq7Digit &&
//         searchParams.advanced.digitFreq7Count
//       ) {
//         const digit7 = searchParams.advanced.digitFreq7Digit.toString().trim();
//         const count7 = parseInt(searchParams.advanced.digitFreq7Count);
//         if (/^\d$/.test(digit7) && count7 >= 1 && count7 <= 10) {
//           console.log(
//             "    Digit Frequency 7 - Digit:",
//             digit7,
//             "Count:",
//             count7,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit7)}){${count7}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq7 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq8Digit &&
//         searchParams.advanced.digitFreq8Count
//       ) {
//         const digit8 = searchParams.advanced.digitFreq8Digit.toString().trim();
//         const count8 = parseInt(searchParams.advanced.digitFreq8Count);
//         if (/^\d$/.test(digit8) && count8 >= 1 && count8 <= 10) {
//           console.log(
//             "    Digit Frequency 8 - Digit:",
//             digit8,
//             "Count:",
//             count8,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit8)}){${count8}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq8 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq9Digit &&
//         searchParams.advanced.digitFreq9Count
//       ) {
//         const digit9 = searchParams.advanced.digitFreq9Digit.toString().trim();
//         const count9 = parseInt(searchParams.advanced.digitFreq9Count);
//         if (/^\d$/.test(digit9) && count9 >= 1 && count9 <= 10) {
//           console.log(
//             "    Digit Frequency 9 - Digit:",
//             digit9,
//             "Count:",
//             count9,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit9)}){${count9}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq9 condition with pattern:", pattern);
//         }
//       }
//       if (
//         searchParams.advanced.digitFreq10Digit &&
//         searchParams.advanced.digitFreq10Count
//       ) {
//         const digit10 = searchParams.advanced.digitFreq10Digit.toString().trim();
//         const count10 = parseInt(searchParams.advanced.digitFreq10Count);
//         if (/^\d$/.test(digit10) && count10 >= 1 && count10 <= 10) {
//           console.log(
//             "    Digit Frequency 10 - Digit:",
//             digit10,
//             "Count:",
//             count10,
//           );
//           const pattern = `(?=(?:.*${escapeRegex(digit10)}){${count10}})`;
//           const condition = {
//             productMobileNumber: {
//               $regex: pattern,
//               $options: "i",
//             },
//           };
//           conditions.push(condition);
//           console.log("    Added digitFreq10 condition with pattern:", pattern);
//         }
//       }
//     }
//     if (conditions.length > MAX_CONDITIONS) {
//       console.warn(
//         `⚠️  Too many conditions (${conditions.length}). Limiting to ${MAX_CONDITIONS}`,
//       );
//       conditions.splice(MAX_CONDITIONS);
//     }
//     const finalQuery = conditions.length > 0 ? { $and: conditions } : {};
//     console.log("\n========================================");
//     console.log("📊 FINAL MONGODB QUERY");
//     console.log("========================================");
//     console.log("Total Conditions:", conditions.length);
//     console.log("Max Allowed:", MAX_CONDITIONS);
//     console.log(JSON.stringify(finalQuery, null, 2));
//     console.log("========================================\n");
//     return finalQuery;
//   } catch (error) {
//     console.error("\n ERROR in buildAdvancedSearchQuery:");
//     console.error("   Message:", error.message);
//     console.error("   Stack:", error.stack);
//     console.error("   Search Params:", JSON.stringify(searchParams, null, 2));
//     console.log("========================================\n");
//     return {};
//   }
// };
//==========================================================================
const escapeRegex = (str) => {
  if (!str || typeof str !== "string") return "";
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (str !== escaped) {
    console.log(`[REGEX ESCAPE] Input: "${str}" => Output: "${escaped}"`);
  }
  return escaped;
};

export const buildAdvancedSearchQuery = (searchParams = {}) => {
  console.log("\n========================================");
  console.log("🔍 ADVANCED SEARCH QUERY BUILDER");
  console.log("========================================");
  console.log(
    "📥 Input searchParams:",
    searchParams ? JSON.stringify(searchParams, null, 2) : "none",
  );
  if (!searchParams || Object.keys(searchParams).length === 0) {
    console.log("⚠️  No search params provided, returning empty query");
    return {};
  }
  const conditions = [];
  const MAX_CONDITIONS = 10;
  try {
    if (searchParams.globalSearch) {
      console.log("\n📌 Processing GLOBAL SEARCH");
      console.log("   📥 Input:", searchParams.globalSearch);
      const cleanInput = searchParams.globalSearch.replace(/\D/g, "");
      if (!cleanInput || cleanInput.length === 0) {
        console.log("   ⚠️  No digits found in search input, skipping");
      } else if (cleanInput.length === 10) {
        console.log("   ✅ Exact 10-digit match:", cleanInput);
        const condition = { productMobileNumber: cleanInput };
        conditions.push(condition);
        console.log("   ✅ Added exact match condition");
      } else {
        console.log("   ✅ Partial digit search:", cleanInput);
        const escapedSearch = escapeRegex(cleanInput);
        const condition = {
          productMobileNumber: { $regex: escapedSearch, $options: "i" },
        };
        conditions.push(condition);
        console.log("   ✅ Added regex condition:", escapedSearch);
      }
    }
    if (searchParams.premium) {
      console.log("\n📌 Processing PREMIUM SEARCH");
      const { startsWith, endsWith, anywhere } = searchParams.premium;
      if (startsWith) {
        console.log("    Starts With:", startsWith);
        const cleanInput = startsWith.replace(/\D/g, "");
        const condition = {
          productMobileNumber: {
            $regex: `^${escapeRegex(cleanInput)}`,
            $options: "i",
          },
        };
        conditions.push(condition);
        console.log("    Added startsWith condition");
      }
      if (endsWith) {
        console.log("    Ends With:", endsWith);
        const cleanInput = endsWith.replace(/\D/g, "");
        const condition = {
          productMobileNumber: {
            $regex: `${escapeRegex(cleanInput)}$`,
            $options: "i",
          },
        };
        conditions.push(condition);
        console.log("    Added endsWith condition");
      }
      if (anywhere) {
        console.log("    Anywhere:", anywhere);
        const cleanInput = anywhere.replace(/\D/g, "");
        const condition = {
          productMobileNumber: {
            $regex: escapeRegex(cleanInput),
            $options: "i",
          },
        };
        conditions.push(condition);
        console.log("    Added anywhere condition");
      }
    }
    if (searchParams.advanced) {
      console.log("\n📌 Processing ADVANCED SEARCH");
      const {
        startsWith,
        endsWith,
        anywhere,
        mustContain,
        notContain,
        literSum,
        trapSum,
        scoreSum,
        exactDigitPlacement,
        mostContain,
      } = searchParams.advanced;
      const patternsMap = {
        DOUBLE: "(\\d)\\1{1}",
        TRIPLE: "(\\d)\\1{2}",
        TETRA: "(\\d)\\1{3}",
        PENTA: "(\\d)\\1{4}",
        HEXA: "(\\d)\\1{5}",
        SEPTA: "(\\d)\\1{6}",
        OCTA: "(\\d)\\1{7}",
        COUNTING: "(?:012|123|234|345|456|567|678|789|987|876|765|654|543|432|321|210)",
        DOUBLING: "(?:1248|248|36|48)",
        ABC_ABC: "(\\d{3})\\1{1}",
        ABC_ABC_ABC: "(\\d{3})\\1{2}",
        AB_AB: "(\\d{2})\\1{1}",
        AB_AB_AB: "(\\d{2})\\1{2}",
        AAA_BBB: "(\\d)\\1{2}(\\d)\\2{2}",
        AB_AB_XY_XY: "(\\d{2})\\1(\\d{2})\\2",
        MIRROR: "(\\d)(\\d)(\\d)\\3\\2\\1",
        SEMI_MIRROR: "(\\d)(\\d)\\2\\1"
      };

      if (startsWith) {
        console.log("    Starts With:", startsWith);
        let condition;
        if (patternsMap[startsWith]) {
          condition = { productMobileNumber: { $regex: `^${patternsMap[startsWith]}` } };
        } else {
          const cleanInput = startsWith.replace(/\D/g, "");
          condition = { productMobileNumber: { $regex: `^${escapeRegex(cleanInput)}` } };
        }
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (endsWith) {
        console.log("    Ends With:", endsWith);
        let condition;
        if (patternsMap[endsWith]) {
          condition = { productMobileNumber: { $regex: `${patternsMap[endsWith]}$` } };
        } else {
          const cleanInput = endsWith.replace(/\D/g, "");
          condition = { productMobileNumber: { $regex: `${escapeRegex(cleanInput)}$` } };
        }
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (anywhere) {
        console.log("    Anywhere:", anywhere);
        const cleanInput = anywhere.replace(/\D/g, "");
        const condition = {
          productMobileNumber: {
            $regex: escapeRegex(cleanInput),
          },
        };
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (mustContain) {
        console.log("    Must Contain:", mustContain);
        const digits = mustContain
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .flatMap((s) => s.split("").filter((d) => /\d/.test(d)))
          .slice(0, 5);
        console.log("    Parsed digits (limited to 5):", digits);
        if (digits.length > 0) {
          const lookaheadPattern = digits
            .map((digit) => `(?=.*${escapeRegex(digit)})`)
            .join("");
          const condition = {
            productMobileNumber: {
              $regex: `^${lookaheadPattern}.*$`,
            },
          };
          conditions.push(condition);
          console.log(
            `    Added mustContain condition for digits: ${digits.join(", ")}`,
          );
          console.log(`    Pattern: ^${lookaheadPattern}.*$`);
        }
      }
      if (notContain) {
        console.log("    Not Contain:", notContain);
        const digits = notContain
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .flatMap((s) => s.split("").filter((d) => /\d/.test(d)))
          .slice(0, 5);
        console.log("    Parsed digits (limited to 5):", digits);
        if (digits.length > 0) {
          const negativeLookaheadPattern = digits
            .map((digit) => `(?!.*${escapeRegex(digit)})`)
            .join("");
          const condition = {
            productMobileNumber: {
              $regex: `^${negativeLookaheadPattern}.*$`,
            },
          };
          conditions.push(condition);
          console.log(
            `    Added notContain condition for digits: ${digits.join(", ")}`,
          );
          console.log(`    Pattern: ^${negativeLookaheadPattern}.*$`);
        }
      }
      if (literSum) {
        console.log("    Liter Sum:", literSum);
        const condition = { liters: Number(literSum) };
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (trapSum) {
        console.log("    Trap Sum:", trapSum);
        const condition = { trap: Number(trapSum) };
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (scoreSum) {
        console.log("    Score Sum:", scoreSum);
        const condition = { score: Number(scoreSum) };
        conditions.push(condition);
        console.log("    Added condition");
      }
      if (exactDigitPlacement) {
        console.log("    Exact Digit Placement:", exactDigitPlacement);
        const cleanPattern = exactDigitPlacement.replace(/[^\d?]/g, "");
        if (cleanPattern.length === 10) {
          const regexPattern = cleanPattern
            .split("")
            .map((char) => (char === "?" ? "\\d" : escapeRegex(char)))
            .join("");
          const condition = {
            productMobileNumber: {
              $regex: `^${regexPattern}$`,
            },
          };
          conditions.push(condition);
          console.log("    Pattern:", regexPattern);
          console.log("    Added condition");
        } else {
          console.warn(
            `     Invalid pattern length: ${cleanPattern.length} (expected 10)`,
          );
        }
      }
      if (mostContain?.digit && mostContain?.count) {
        console.log(
          "⚠️  mostContain feature DISABLED due to performance/security concerns",
        );
        console.log(
          "    Requested - Digit:",
          mostContain.digit,
          "Count:",
          mostContain.count,
        );
        console.log(
          "    This feature causes catastrophic regex backtracking and server crashes",
        );
      }
      // Process all 10 digit frequency groups
      for (let i = 1; i <= 10; i++) {
        const digitKey = `digitFreq${i}Digit`;
        const countKey = `digitFreq${i}Count`;
        const maxCountKey = `digitFreq${i}MaxCount`;

        if (searchParams.advanced[digitKey] && searchParams.advanced[countKey]) {
          const digit = searchParams.advanced[digitKey].toString().trim();
          const count = parseInt(searchParams.advanced[countKey]);
          const maxCount = searchParams.advanced[maxCountKey] ? parseInt(searchParams.advanced[maxCountKey]) : undefined;

          if (/^\d+$/.test(digit) && count >= 1 && count <= 9) {
            console.log(
              `    Digit Frequency ${i} - Sequence: ${digit}, Min Count: ${count}${maxCount ? `, Max Count: ${maxCount}` : ''}`,
            );
            
            // Build the lookahead for minimum count
            let pattern = `(?=(?:.*${escapeRegex(digit)}){${count}})`;
            
            // Add negative lookahead for maximum count if specified
            if (maxCount !== undefined && maxCount >= count) {
              pattern += `(?!(?:.*${escapeRegex(digit)}){${maxCount + 1}})`;
            }
            
            pattern += `.*`;
            
            const condition = {
              productMobileNumber: {
                $regex: pattern,
                $options: "i",
              },
            };
            conditions.push(condition);
            console.log(
              `    Added digitFreq${i} condition with pattern: ${pattern}`,
            );
          }
        }
      }
    }
    if (conditions.length > MAX_CONDITIONS) {
      console.warn(
        `⚠️  Too many conditions (${conditions.length}). Limiting to ${MAX_CONDITIONS}`,
      );
      conditions.splice(MAX_CONDITIONS);
    }
    const finalQuery = conditions.length > 0 ? { $and: conditions } : {};
    console.log("\n========================================");
    console.log("📊 FINAL MONGODB QUERY");
    console.log("========================================");
    console.log("Total Conditions:", conditions.length);
    console.log("Max Allowed:", MAX_CONDITIONS);
    console.log(JSON.stringify(finalQuery, null, 2));
    console.log("========================================\n");
    return finalQuery;
  } catch (error) {
    console.error("\n ERROR in buildAdvancedSearchQuery:");
    console.error("   Message:", error.message);
    console.error("   Stack:", error.stack);
    console.error("   Search Params:", JSON.stringify(searchParams, null, 2));
    console.log("========================================\n");
    return {};
  }
};