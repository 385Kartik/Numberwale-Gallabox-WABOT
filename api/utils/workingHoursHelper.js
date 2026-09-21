/**
 * Working Hours & Office Calendar Helper for WhatsApp Bot (IST / Asia/Kolkata)
 * 
 * Standard Rules:
 * - Monday to Saturday: 10:00 AM to 7:00 PM (10:00 - 19:00 IST) = 9 working hours / day
 * - Sunday: Completely closed (0 working hours)
 * - Full Day Holiday / Leave: Completely closed (0 working hours)
 * - Half Day Holiday / Leave: Working window adjusted according to leave schedule
 */

let cachedOfficeStatus = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export function parseTimeToMinutes(timeStr, defaultMinutes = 0) {
  if (!timeStr || typeof timeStr !== 'string') return defaultMinutes;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return defaultMinutes;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return defaultMinutes;
  return h * 60 + m;
}

export function formatMinutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = String(m).padStart(2, '0');
  return `${String(displayH).padStart(2, '0')}:${displayM} ${period}`;
}

export function getISTDateParts(dateInput = new Date()) {
  const d = new Date(dateInput);
  const istStr = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istStr);

  const year = istDate.getFullYear();
  const month = istDate.getMonth(); // 0-indexed
  const date = istDate.getDate();
  const day = istDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const seconds = istDate.getSeconds();

  const yyyy = String(year);
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(date).padStart(2, '0');
  const dateString = `${yyyy}-${mm}-${dd}`;

  return {
    year,
    month,
    date,
    day,
    hours,
    minutes,
    seconds,
    totalMinutes: hours * 60 + minutes,
    dateString,
    rawISTDate: istDate
  };
}

export function findHolidayForDate(dateString, holidays = []) {
  if (!Array.isArray(holidays) || holidays.length === 0) return null;
  return holidays.find(h => h && h.isActive !== false && h.date === dateString) || null;
}

export function getWorkingWindowsForDate(dateString, dayOfWeek, holidays = []) {
  // Sunday is always closed
  if (dayOfWeek === 0) {
    return [];
  }

  const holiday = findHolidayForDate(dateString, holidays);
  if (holiday) {
    if (holiday.type === 'full_day') {
      return []; // Full day off
    }
    if (holiday.type === 'half_day') {
      if (holiday.workingStartTime && holiday.workingEndTime) {
        const start = parseTimeToMinutes(holiday.workingStartTime, 10 * 60);
        const end = parseTimeToMinutes(holiday.workingEndTime, 19 * 60);
        return start < end ? [[start, end]] : [];
      }
      if (holiday.halfDayType === 'first_half') {
        // Office closed 10:00 to 14:00, open 14:00 to 19:00
        return [[14 * 60, 19 * 60]];
      }
      if (holiday.halfDayType === 'second_half') {
        // Office open 10:00 to 14:00, closed 14:00 to 19:00
        return [[10 * 60, 14 * 60]];
      }
      if (holiday.nonWorkingStartTime && holiday.nonWorkingEndTime) {
        const nwStart = parseTimeToMinutes(holiday.nonWorkingStartTime, 14 * 60);
        const nwEnd = parseTimeToMinutes(holiday.nonWorkingEndTime, 19 * 60);
        const windows = [];
        if (10 * 60 < nwStart) windows.push([10 * 60, Math.min(19 * 60, nwStart)]);
        if (nwEnd < 19 * 60) windows.push([Math.max(10 * 60, nwEnd), 19 * 60]);
        return windows;
      }
    }
  }

  // Normal working day: 10:00 AM to 7:00 PM IST (600 to 1140 minutes)
  return [[10 * 60, 19 * 60]];
}

/**
 * Calculates accurate working hours elapsed and remaining (default target 24 working hours).
 */
export function calculateWorkingHoursRemaining(processedDate, targetHours = 24, holidays = [], now = new Date()) {
  if (!processedDate) {
    return {
      elapsedWorkingHours: 0,
      remainingWorkingHours: targetHours,
      totalWorkingMinutes: 0
    };
  }

  const startParts = getISTDateParts(processedDate);
  const nowParts = getISTDateParts(now);

  const startTimeMs = new Date(startParts.rawISTDate).getTime();
  const nowTimeMs = new Date(nowParts.rawISTDate).getTime();

  if (startTimeMs >= nowTimeMs) {
    return {
      elapsedWorkingHours: 0,
      remainingWorkingHours: targetHours,
      totalWorkingMinutes: 0
    };
  }

  let totalWorkingMinutes = 0;

  const cur = new Date(startParts.year, startParts.month, startParts.date);
  const end = new Date(nowParts.year, nowParts.month, nowParts.date);

  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = cur.getDay();

    const isStartDay = (dateStr === startParts.dateString);
    const isNowDay = (dateStr === nowParts.dateString);

    const windows = getWorkingWindowsForDate(dateStr, dayOfWeek, holidays);

    for (const [winStart, winEnd] of windows) {
      let effectiveStart = winStart;
      let effectiveEnd = winEnd;

      if (isStartDay) {
        effectiveStart = Math.max(effectiveStart, startParts.totalMinutes);
      }
      if (isNowDay) {
        effectiveEnd = Math.min(effectiveEnd, nowParts.totalMinutes);
      }

      if (effectiveEnd > effectiveStart) {
        totalWorkingMinutes += (effectiveEnd - effectiveStart);
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  const elapsedWorkingHours = Math.round((totalWorkingMinutes / 60) * 10) / 10;
  const remainingWorkingHours = Math.max(0, Math.round((targetHours - elapsedWorkingHours) * 10) / 10);

  return {
    elapsedWorkingHours,
    remainingWorkingHours,
    totalWorkingMinutes
  };
}

/**
 * Returns current office status (Open / Non-Working Day / Non-Working Hours).
 */
export function getOfficeHoursStatus(holidays = [], dateInput = new Date()) {
  const ist = getISTDateParts(dateInput);
  const isSunday = (ist.day === 0);
  const holiday = findHolidayForDate(ist.dateString, holidays);

  let isNonWorkingDay = false;
  let isHoliday = false;
  let isHalfDay = false;
  let isOpen = false;
  let isNonWorkingHour = false;
  let reason = '';

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formattedTime = formatMinutesToTime(ist.totalMinutes);

  if (isSunday) {
    isNonWorkingDay = true;
    isOpen = false;
    isNonWorkingHour = true;
    reason = 'Sunday Weekly Off';
  } else if (holiday && holiday.type === 'full_day') {
    isNonWorkingDay = true;
    isHoliday = true;
    isOpen = false;
    isNonWorkingHour = true;
    reason = holiday.title || 'Office Holiday';
  } else {
    const windows = getWorkingWindowsForDate(ist.dateString, ist.day, holidays);
    if (holiday && holiday.type === 'half_day') {
      isHoliday = true;
      isHalfDay = true;
    }

    if (windows.length === 0) {
      isNonWorkingDay = true;
      isOpen = false;
      isNonWorkingHour = true;
      reason = holiday ? holiday.title : 'Office Closed';
    } else {
      const inWindow = windows.some(([s, e]) => ist.totalMinutes >= s && ist.totalMinutes < e);
      if (inWindow) {
        isOpen = true;
        isNonWorkingHour = false;
        reason = 'Office Open (Helpline Active 10am - 7pm)';
      } else {
        isOpen = false;
        isNonWorkingHour = true;
        if (isHalfDay) {
          reason = `Office Closed (${holiday.title || 'Half Day Leave'})`;
        } else if (ist.totalMinutes < 10 * 60) {
          reason = 'Before Working Hours (Opens at 10:00 AM)';
        } else {
          reason = 'After Working Hours (Office closed at 7:00 PM)';
        }
      }
    }
  }

  let nextWorkingDay = '';
  let nextWorkingTime = '10:00 AM';

  const searchDate = new Date(ist.rawISTDate);
  let found = false;

  if (!isOpen && !isSunday && !isNonWorkingDay) {
    const todayWindows = getWorkingWindowsForDate(ist.dateString, ist.day, holidays);
    const laterWin = todayWindows.find(([s]) => s > ist.totalMinutes);
    if (laterWin) {
      nextWorkingDay = 'Today';
      nextWorkingTime = formatMinutesToTime(laterWin[0]);
      found = true;
    }
  }

  if (!found) {
    for (let i = 1; i <= 14; i++) {
      searchDate.setDate(searchDate.getDate() + 1);
      const sDay = searchDate.getDay();
      const sYyyy = searchDate.getFullYear();
      const sMm = String(searchDate.getMonth() + 1).padStart(2, '0');
      const sDd = String(searchDate.getDate()).padStart(2, '0');
      const sDateStr = `${sYyyy}-${sMm}-${sDd}`;

      const sWindows = getWorkingWindowsForDate(sDateStr, sDay, holidays);
      if (sWindows.length > 0) {
        nextWorkingDay = (i === 1) ? 'Tomorrow' : dayNames[sDay];
        nextWorkingTime = formatMinutesToTime(sWindows[0][0]);
        found = true;
        break;
      }
    }
  }

  return {
    isOpen,
    isNonWorkingDay,
    isNonWorkingHour,
    isSunday,
    isHoliday,
    isHalfDay,
    holiday: holiday ? {
      title: holiday.title,
      type: holiday.type,
      halfDayType: holiday.halfDayType,
      nonWorkingStartTime: holiday.nonWorkingStartTime,
      nonWorkingEndTime: holiday.nonWorkingEndTime
    } : null,
    reason,
    currentDay: dayNames[ist.day],
    currentTime: formattedTime,
    currentDate: ist.dateString,
    nextWorkingDay,
    nextWorkingTime,
    schedule: "10:00 AM to 7:00 PM, Monday to Saturday (Closed on Sundays)",
    rawDate: dateInput
  };
}

/**
 * Fetch office status and active holidays from CRM server with 5-minute cache.
 */
export async function fetchOfficeStatusFromCRM(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedOfficeStatus && now < cacheExpiresAt) {
    return cachedOfficeStatus;
  }

  const API_URL = process.env.ADMIN_API_URL || process.env.MAIN_API_URL || 'https://api.numberwale.com';
  try {
    const { default: axios } = await import('axios');
    const res = await axios.get(`${API_URL}/api/v1/office-calendar/status`, { timeout: 3000 });
    if (res.data && res.data.success) {
      cachedOfficeStatus = res.data;
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedOfficeStatus;
    }
  } catch (err) {
    // Fallback gracefully without breaking bot
    // console.warn('[Bot] Note: could not reach office calendar endpoint, using standard rules:', err.message);
  }

  // Fallback to local evaluation with standard Mon-Sat 10am-7pm, Sun off
  const localStatus = getOfficeHoursStatus([]);
  cachedOfficeStatus = {
    success: true,
    status: 'success',
    ...localStatus,
    activeHolidays: []
  };
  cacheExpiresAt = now + 60 * 1000; // Retry in 1 minute on failure
  return cachedOfficeStatus;
}
