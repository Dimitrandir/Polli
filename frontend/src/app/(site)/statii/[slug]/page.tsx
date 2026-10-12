import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingCta } from "@/components/site/BookingCta";
import { content } from "@/lib/content";
import { formatArticleDate } from "@/lib/site";
import { Markdown } from "@/lib/markdown";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await content.article(decodeURIComponent((await params).slug));
  return article ? { title: article.title, description: article.excerpt } : {};
}

export default async function ArticlePage({ params }: Props) {
  const article = await content.article(decodeURIComponent((await params).slug));
  if (!article) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-8">
      <article className="pt-12 sm:pt-16">
        <Link
          href="/statii"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Всички статии
        </Link>
        <time
          dateTime={article.published_at}
          className="mt-10 block text-xs font-semibold uppercase tracking-[0.2em] text-accent"
        >
          {formatArticleDate(article.published_at)}
        </time>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-ink sm:text-6xl">{article.title}</h1>
        {article.cover_image_url && (
          <div className="relative mt-10 aspect-[16/10] overflow-hidden rounded-[2rem] bg-surface-2">
            <Image
              src={article.cover_image_url}
              alt=""
              fill
              unoptimized
              priority
              sizes="(min-width: 768px) 48rem, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <Markdown source={article.body} className="prose-salon mt-10" />
        {article.tags.length > 0 && (
          <ul className="mt-12 flex flex-wrap gap-2" aria-label="Тагове">
            {article.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/statii?tag=${encodeURIComponent(tag)}`}
                  className="block rounded-full px-3 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line hover:text-ink hover:ring-accent"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
      <BookingCta text="Искате съвет за вашата коса? Запазете час при нас." />
    </main>
  );
}
