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

const WEEKDAYS = [
  "Понеделник",
  "Вторник",
  "Сряда",
  "Четвъртък",
  "Петък",
  "Събота",
  "Неделя",
];

/** Opening hours as rows such as "Понеделник – Петък: 10:00 – 19:00", with days off listed too. */
export function openingHoursRows(
  hours: OpeningHours[],
): { days: string; time: string }[] {
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
    const days =
      day - 1 === start
        ? WEEKDAYS[start]
        : `${WEEKDAYS[start]} – ${WEEKDAYS[day - 1]}`;
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

/** One card in the article list: our own article, or an interview in another outlet that links out. */
export type FeedItem = {
  key: string;
  href: string;
  external: boolean;
  title: string;
  excerpt: string;
  cover: string;
  date: string;
  /** The outlet when the piece is an interview in the media. */
  outlet: string | null;
};

type FeedArticle = {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string;
  published_at: string;
};
type FeedMedia = {
  slug: string;
  title: string;
  outlet: string;
  url: string;
  published_on: string | null;
  summary: string;
  cover_image_url: string;
  article_slug: string | null;
};

/**
 * Our articles and Poli's interviews in other media as one list, newest first. An interview the salon wrote
 * up as its own article appears once, as that article, marked with the outlet. With onlyMedia, just the
 * interviews.
 */
export function articleFeed(
  articles: FeedArticle[],
  media: FeedMedia[],
  onlyMedia = false,
): FeedItem[] {
  const outletOf = new Map(
    media
      .filter((m) => m.article_slug)
      .map((m) => [m.article_slug as string, m.outlet]),
  );
  const own: FeedItem[] = articles
    .map((a) => ({
      key: a.slug,
      href: `/statii/${encodeURIComponent(a.slug)}`,
      external: false,
      title: a.title,
      excerpt: a.excerpt,
      cover: a.cover_image_url,
      date: a.published_at,
      outlet: outletOf.get(a.slug) ?? null,
    }))
    .filter((item) => !onlyMedia || item.outlet);
  const ownSlugs = new Set(articles.map((a) => a.slug));
  const outside: FeedItem[] = media
    .filter((m) => !m.article_slug || !ownSlugs.has(m.article_slug))
    .map((m) => ({
      key: `media-${m.slug}`,
      href: m.url,
      external: true,
      title: m.title,
      excerpt: m.summary,
      cover: m.cover_image_url,
      date: m.published_on ?? "",
      outlet: m.outlet,
    }));
  return [...own, ...outside].sort((a, b) => b.date.localeCompare(a.date));
}
