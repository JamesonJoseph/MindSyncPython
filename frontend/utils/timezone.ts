// Timezone utility for IST (Indian Standard Time - Asia/Kolkata)
// IST is UTC+5:30

const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds

/**
 * Get current date/time in IST
 */
export function getISTNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + IST_OFFSET);
}

/**
 * Convert a date to IST string for display
 */
export function formatISTDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Convert a date to IST time string for display
 */
export function formatISTTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get today's date in IST (as YYYY-MM-DD string)
 */
export function getTodayIST(): string {
  const istNow = getISTNow();
  const year = istNow.getFullYear();
  const month = String(istNow.getMonth() + 1).padStart(2, '0');
  const day = String(istNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in IST (as HH:MM string)
 */
export function getCurrentTimeIST(): string {
  const istNow = getISTNow();
  return istNow.toTimeString().slice(0, 5);
}

/**
 * Parse time string like "9:00 AM" or "14:30" to hours and minutes
 */
function parseTimeStr(timeStr: string): { hours: number; minutes: number } {
  const cleanTime = timeStr.trim().toUpperCase();
  let hours = 0;
  let minutes = 0;

  // Check for AM/PM format
  const isPM = cleanTime.includes('PM');
  const isAM = cleanTime.includes('AM');
  const timeOnly = cleanTime.replace(/\s*(AM|PM)\s*/i, '').trim();
  const parts = timeOnly.split(':');

  if (parts.length >= 2) {
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
  } else if (parts.length === 1) {
    hours = parseInt(parts[0], 10) || 0;
    minutes = 0;
  }

  // Convert to 24-hour format
  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

/**
 * Convert date and time strings to ISO string in IST timezone
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Optional time string like "9:00 AM" or "14:30"
 */
export function toISTISOString(dateStr: string, timeStr?: string): string {
  try {
    // Parse the date parts
    const dateParts = dateStr.split('-').map(p => parseInt(p, 10));
    const year = dateParts[0] || new Date().getFullYear();
    const month = dateParts[1] || 1;
    const day = dateParts[2] || 1;

    let hours = 0;
    let minutes = 0;

    if (timeStr && timeStr.trim()) {
      const parsed = parseTimeStr(timeStr);
      hours = parsed.hours;
      minutes = parsed.minutes;
    }

    // Validate values
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid time: ${timeStr}`);
    }

    // Clamp values to valid ranges
    hours = Math.max(0, Math.min(23, hours));
    minutes = Math.max(0, Math.min(59, minutes));
    const clampedMonth = Math.max(1, Math.min(12, month));
    const clampedDay = Math.max(1, Math.min(31, day));

    // Create date in UTC with IST offset (IST = UTC+5:30)
    // UTC time = IST time - 5:30
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(Date.UTC(year, clampedMonth - 1, clampedDay, hours, minutes, 0));
    const utcDate = new Date(istDate.getTime() - istOffsetMs);

    return utcDate.toISOString();
  } catch (error) {
    console.error('Error in toISTISOString:', error, { dateStr, timeStr });
    // Fallback: return current time in ISO format
    return new Date().toISOString();
  }
}

/**
 * Format date for calendar display in IST
 */
export function formatDateIST(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Check if a date is today in IST
 */
export function isTodayIST(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const todayIST = getISTNow();
  
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === 
         todayIST.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Convert ISO string to IST Date object
 */
export function fromISOToIST(isoString: string): Date {
  const date = new Date(isoString);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + IST_OFFSET);
}
