import { describe, expect, it } from "vitest";

import {
  articleFeed,
  formatArticleDate,
  mediaPath,
  openingHoursRows,
} from "./site";

describe("content helpers", () => {
  it("groups days with the same opening hours", () => {
    const weekdays = [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      start_time: "10:00",
      end_time: "19:00",
    }));
    const rows = openingHoursRows([
      ...weekdays,
      { weekday: 5, start_time: "10:00", end_time: "17:00" },
    ]);
    expect(rows).toEqual([
      { days: "Понеделник – Петък", time: "10:00 – 19:00" },
      { days: "Събота", time: "10:00 – 17:00" },
      { days: "Неделя", time: "почивен ден" },
    ]);
  });

  it("serves uploaded photos from the site's own /media path", () => {
    expect(mediaPath("http://localhost:8000/media/specialists/poli.jpg")).toBe(
      "/media/specialists/poli.jpg",
    );
    expect(mediaPath(null)).toBeNull();
    expect(mediaPath("https://evil.example/x.jpg")).toBeNull();
  });

  it("formats article dates in Bulgarian", () => {
    expect(formatArticleDate("2025-09-21T16:52:16+03:00")).toBe(
      "21 септември 2025",
    );
  });
});

describe("articleFeed", () => {
  const article = (slug: string, published_at: string) => ({
    slug,
    title: slug,
    excerpt: "",
    cover_image_url: `/${slug}.jpg`,
    published_at,
  });
  const media = (
    slug: string,
    published_on: string,
    article_slug: string | null,
  ) => ({
    slug,
    title: slug,
    outlet: `Outlet ${slug}`,
    url: `https://example.bg/${slug}`,
    published_on,
    summary: "резюме",
    cover_image_url: `/press/${slug}.jpg`,
    article_slug,
  });
  const articles = [
    article("kosopad", "2026-03-17T10:00:00+02:00"),
    article("vibes", "2025-11-06T10:00:00+02:00"),
  ];
  const press = [
    media("vibes-bg", "2025-10-13", "vibes"),
    media("profit", "2024-10-26", null),
  ];

  it("merges our articles and outside interviews, newest first, without duplicates", () => {
    const feed = articleFeed(articles, press);
    expect(feed.map((i) => i.key)).toEqual([
      "kosopad",
      "vibes",
      "media-profit",
    ]);
    expect(feed[1]).toMatchObject({
      outlet: "Outlet vibes-bg",
      external: false,
      href: "/statii/vibes",
    });
    expect(feed[2]).toMatchObject({
      external: true,
      href: "https://example.bg/profit",
      cover: "/press/profit.jpg",
    });
  });

  it("shows only interviews in the media when asked", () => {
    expect(articleFeed(articles, press, true).map((i) => i.key)).toEqual([
      "vibes",
      "media-profit",
    ]);
  });
});
