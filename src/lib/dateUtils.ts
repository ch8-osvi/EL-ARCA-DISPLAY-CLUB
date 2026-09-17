/**
 * Date and Time utilities for Cuba (America/Havana) timezone.
 * Ensures consistent day, month, hour and order number calculations
 * regardless of host server timezone (Vercel UTC).
 */

export const CUBA_TIMEZONE = 'America/Havana';

/**
 * Returns "YYYY-MM-DD" string representing the calendar day in Cuba.
 */
export function getHavanaDateKey(date: string | number | Date = new Date()): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CUBA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Returns { mm, dd, year } strings in Cuba timezone.
 */
export function getHavanaMonthDay(date: string | number | Date = new Date()): { mm: string; dd: string; year: string } {
  const [year, mm, dd] = getHavanaDateKey(date).split('-');
  return { mm, dd, year };
}

/**
 * Returns a "YYYY-MM-DD" string for N days ago in Cuba timezone.
 * Example: daysAgo = 1 returns yesterday in Cuba.
 */
export function getHavanaDaysAgoKey(daysAgo: number): string {
  const [y, m, d] = getHavanaDateKey().split('-').map(Number);
  const targetUtc = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const yStr = targetUtc.getUTCFullYear();
  const mStr = String(targetUtc.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(targetUtc.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Formats a date string or object into a human readable localized Cuba date and time.
 * Example: "10/09/2026, 11:00 PM"
 */
export function formatHavanaDateTime(date: string | number | Date): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleString('es-CU', {
    timeZone: CUBA_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

