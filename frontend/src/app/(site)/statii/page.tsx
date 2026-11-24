import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";
import { articleFeed, formatArticleDate } from "@/lib/site";

export const metadata: Metadata = {
  title: "Статии",
  description:
    "Съвети за здрава и красива коса от колориста и трихолог Поли Ботева и интервютата ѝ в медиите.",
};

const chip = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
    active
      ? "bg-ink text-surface ring-ink"
      : "text-ink-soft ring-line hover:text-ink hover:ring-accent/60"
  }`;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; v?: string }>;
}) {
  const { tag, v } = await searchParams;
  const onlyMedia = !tag && v === "mediite";
  const [articles, media] = await Promise.all([
    content.articles(tag),
    tag ? [] : content.mediaArticles(),
  ]);
  // Without the media list the page still shows our own articles.
  const items = articles ? articleFeed(articles, media ?? [], onlyMedia) : null;
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-8">
      <PageHeader
        eyebrow="Статии"
        title={
          tag
            ? `Статии за „${tag}“`
            : onlyMedia
              ? "Поли Ботева в медиите"
              : "Грижа за косата"
        }
      >
        {tag ? (
          <Link href="/statii" className="text-accent hover:underline">
            Всички статии
          </Link>
        ) : (
          "Съвети, тенденции и интервюта с Поли в български издания."
        )}
      </PageHeader>
      {!tag && (
        <nav
          aria-label="Вид статии"
          className="-mt-4 mb-8 flex flex-wrap gap-2"
        >
          <Link
            href="/statii"
            className={chip(!onlyMedia)}
            aria-current={!onlyMedia ? "page" : undefined}
          >
            Всички
          </Link>
          <Link
            href="/statii?v=mediite"
            className={chip(onlyMedia)}
            aria-current={onlyMedia ? "page" : undefined}
          >
            Поли в медиите
          </Link>
        </nav>
      )}
      {!items ? (
        <Unavailable what="Статиите" />
      ) : items.length === 0 ? (
        <p className="text-ink-soft">Няма статии с този таг.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const card = (
              <>
                <div className="relative aspect-[16/10] bg-surface-2">
                  {item.cover && (
                    <Image
                      src={item.cover}
                      alt=""
                      fill
                      unoptimized
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                <div className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                    {item.outlet && <span>В медиите · {item.outlet}</span>}
                    {item.outlet && item.date && " · "}
                    {item.date && (
                      <time dateTime={item.date}>
                        {formatArticleDate(item.date)}
                      </time>
                    )}
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink">
                    {item.title}
                  </h2>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                    {item.excerpt}
                  </p>
                  {item.external && (
                    <p className="mt-4 text-sm font-semibold text-accent">
                      Прочети в {item.outlet}
                      <span aria-hidden="true"> ↗</span>
                    </p>
                  )}
                </div>
              </>
            );
            const className =
              "group overflow-hidden rounded-[2rem] bg-surface/70 ring-1 ring-line transition hover:ring-accent/60";
            return item.external ? (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {card}
              </a>
            ) : (
              <Link key={item.key} href={item.href} className={className}>
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
