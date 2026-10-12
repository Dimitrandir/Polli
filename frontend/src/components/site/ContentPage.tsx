import type { ReactNode } from "react";

import { content } from "@/lib/content";
import { Markdown } from "@/lib/markdown";

import { PageHeader } from "./PageHeader";

/** A text page managed in the admin (Съдържание → Страници), with a fallback while it is missing. */
export async function ContentPage({ slug, title, fallback }: { slug: string; title: string; fallback: ReactNode }) {
  const page = await content.page(slug);
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-8">
      <PageHeader eyebrow="SIS Esthetics Hair" title={page?.title ?? title} />
      {page ? <Markdown source={page.body} /> : <div className="leading-relaxed text-ink-soft">{fallback}</div>}
    </main>
  );
}
