import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";
import { formatArticleDate } from "@/lib/site";

export const metadata: Metadata = {
  title: "Статии",
  description: "Съвети за здрава и красива коса от колориста и трихолог Поли Ботева.",
};

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const articles = await content.articles(tag);
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-8">
      <PageHeader eyebrow="Статии" title={tag ? `Статии за „${tag}“` : "Грижа за косата"}>
        {tag ? (
          <Link href="/statii" className="text-accent hover:underline">
            Всички статии
          </Link>
        ) : (
          "Съвети, интервюта и тенденции от нашия екип."
        )}
      </PageHeader>
      {!articles ? (
        <Unavailable what="Статиите" />
      ) : articles.length === 0 ? (
        <p className="text-ink-soft">Няма статии с този таг.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/statii/${encodeURIComponent(article.slug)}`}
              className="group overflow-hidden rounded-[2rem] bg-surface/70 ring-1 ring-line transition hover:ring-accent/60"
            >
              <div className="relative aspect-[16/10] bg-surface-2">
                {article.cover_image_url && (
                  <Image
                    src={article.cover_image_url}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <div className="p-6">
                <time
                  dateTime={article.published_at}
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
                >
                  {formatArticleDate(article.published_at)}
                </time>
                <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink">{article.title}</h2>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">{article.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
