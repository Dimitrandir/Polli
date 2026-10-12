// Display helpers for the public content pages. Kept free of server-only imports so they are easy to test.

import type { OpeningHours } from "./content";

/** Uploaded files are served under /media on the site's own origin (see next.config.ts). */
export function mediaPath(url: string | null): string | null {
  if (!url) return null;
  try {
    const { pathname } = new URL(url, "http://localhost");
    return pathname.startsWith("/media/") ? pathname : null;
  } catch {
    return null;
  }
}

const WEEKDAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];

/** Opening hours as rows such as "Понеделник – Петък: 10:00 – 19:00", with days off listed too. */
export function openingHoursRows(hours: OpeningHours[]): { days: string; time: string }[] {
  const byDay = WEEKDAYS.map((_, day) =>
    hours
      .filter((h) => h.weekday === day)
      .map((h) => `${h.start_time} – ${h.end_time}`)
      .join(", "),
  );
  const rows: { days: string; time: string }[] = [];
  let start = 0;
  for (let day = 1; day <= WEEKDAYS.length; day++) {
    if (day < WEEKDAYS.length && byDay[day] === byDay[start]) continue;
    const days = day - 1 === start ? WEEKDAYS[start] : `${WEEKDAYS[start]} – ${WEEKDAYS[day - 1]}`;
    rows.push({ days, time: byDay[start] || "почивен ден" });
    start = day;
  }
  return rows;
}

const dateFormat = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Sofia",
});

export function formatArticleDate(iso: string): string {
  return dateFormat.format(new Date(iso)).replace(/\s*г\.$/, "");
}
