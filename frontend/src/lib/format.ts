// Display helpers. All times are shown in the salon's time zone, whatever the visitor's device says.

export const SALON_TZ = "Europe/Sofia";
const LOCALE = "bg-BG";

const priceFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });

export function formatPrice(value: string | number): string {
  return priceFormat.format(typeof value === "string" ? Number(value) : value);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  if (!m) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: SALON_TZ }).format(
    new Date(iso),
  );
}

/** "Понеделник, 19 октомври" (only the first letter is capitalised, as Bulgarian requires). */
export function formatLongDate(isoOrDate: string): string {
  const date = isoOrDate.length === 10 ? fromDateKey(isoOrDate) : new Date(isoOrDate);
  const text = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: isoOrDate.length === 10 ? "UTC" : SALON_TZ,
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "18.10.2026" in salon time. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: SALON_TZ })
    .format(new Date(iso))
    .replace(/\s*г\.?$/, "");
}

const MONTHS_SHORT = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"];
const WEEKDAYS_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Parts for the week strip: { weekday: "пн", day: "19", month: "окт" }. */
export function weekdayParts(dateKey: string): { weekday: string; day: string; month: string } {
  const date = fromDateKey(dateKey);
  return {
    weekday: WEEKDAYS_SHORT[date.getUTCDay()],
    day: String(date.getUTCDate()),
    month: MONTHS_SHORT[date.getUTCMonth()],
  };
}

// --- Calendar dates as "YYYY-MM-DD" keys, independent of the device time zone ------------------

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

/** Today's date in the salon's time zone. */
export function todayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SALON_TZ }).format(now);
}

/** Monday of the week that contains `key`. */
export function startOfWeek(key: string): string {
  const weekday = (fromDateKey(key).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(key, -weekday);
}

/** Hour of an ISO time in the salon's time zone (for grouping slots into morning/afternoon/evening). */
export function salonHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: SALON_TZ }).format(new Date(iso)),
  );
}

/** Compact UTC timestamp for .ics files: 20261019T060000Z */
export function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
