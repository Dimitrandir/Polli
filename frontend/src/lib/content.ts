// Server-side reads of the salon's content (services, team, articles, pages, contacts) for the
// public pages. They run on the Next server and call Django directly.

import { connection } from "next/server";

import type { Category } from "./api";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export type OpeningHours = { weekday: number; start_time: string; end_time: string };

export type SalonInfo = {
  name: string;
  legal_name: string;
  phone: string;
  email: string;
  address: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  booking_policy: string;
  opening_hours: OpeningHours[];
};

export type TeamMember = {
  id: number;
  name: string;
  title: string;
  bio: string;
  photo: string | null;
  services: { id: number; name: string; price: string; duration_minutes: number }[];
};

export type ArticleSummary = {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string;
  tags: string[];
  published_at: string;
};

export type Article = ArticleSummary & { body: string };

export type Page = { slug: string; title: string; body: string; updated_at: string };

/** GET a Django API path. Returns null when it is missing or the backend cannot be reached. */
async function get<T>(path: string): Promise<T | null> {
  // Always render with fresh data, and never at build time when the backend may be down.
  await connection();
  try {
    const response = await fetch(`${BACKEND}/api/${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export const content = {
  salon: () => get<SalonInfo>("salon/"),
  categories: () => get<Category[]>("categories/"),
  team: () => get<TeamMember[]>("specialists/"),
  articles: (tag?: string) => get<ArticleSummary[]>(tag ? `articles/?tag=${encodeURIComponent(tag)}` : "articles/"),
  article: (slug: string) => get<Article>(`articles/${encodeURIComponent(slug)}/`),
  page: (slug: string) => get<Page>(`pages/${encodeURIComponent(slug)}/`),
};
