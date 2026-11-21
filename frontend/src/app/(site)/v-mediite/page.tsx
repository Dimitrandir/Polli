import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";
import { formatArticleDate } from "@/lib/site";

export const metadata: Metadata = {
  title: "В медиите",
  description:
    "Интервюта и статии с колориста и трихолог Поли Ботева в български издания.",
};

export default async function MediaPage() {
  const items = await content.mediaArticles();
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-8">
      <PageHeader eyebrow="В медиите" title="Поли Ботева в медиите">
        Интервюта и експертни материали за здравата коса, скалпа и фризьорския
        занаят, публикувани в други издания.
      </PageHeader>
      {!items ? (
        <Unavailable what="Публикациите" />
      ) : items.length === 0 ? (
        <p className="text-ink-soft">Все още няма публикации.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.slug}
              className="flex flex-col rounded-[2rem] bg-surface/70 p-6 ring-1 ring-line sm:p-7"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                {item.outlet}
                {item.published_on && (
                  <>
                    {" · "}
                    <time dateTime={item.published_on}>
                      {formatArticleDate(item.published_on)}
                    </time>
                  </>
                )}
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink">
                {item.title}
              </h2>
              {item.summary && (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {item.summary}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5 text-sm font-semibold">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  Прочети в {item.outlet}
                  <span aria-hidden="true"> ↗</span>
                </a>
                {item.article_slug && (
                  <Link
                    href={`/statii/${encodeURIComponent(item.article_slug)}`}
                    className="text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                  >
                    Накратко при нас
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
