import type { Metadata } from "next";
import Image from "next/image";

import { BookingCta } from "@/components/site/BookingCta";
import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";
import { mediaPath } from "@/lib/site";

export const metadata: Metadata = {
  title: "Нашият екип",
  description: "Запознайте се със специалистите на SIS Esthetics Hair.",
};

export default async function TeamPage() {
  const team = await content.team();
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-8">
      <PageHeader eyebrow="За нас" title="Нашият екип">
        Колористика, стайлинг и грижа за ноктите от хора, които обичат работата си.
      </PageHeader>
      {!team ? (
        <Unavailable what="Специалистите" />
      ) : (
        <div className="space-y-20">
          {team.map((member, index) => {
            const photo = mediaPath(member.photo);
            return (
              <article
                key={member.id}
                className="grid items-start gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-14"
              >
                <div
                  className={`relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-surface-2 ring-1 ring-line ${index % 2 ? "md:order-2" : ""}`}
                >
                  {photo && (
                    <Image
                      src={photo}
                      alt={member.name}
                      fill
                      unoptimized
                      sizes="(min-width: 768px) 40vw, 100vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <div>
                  <h2 className="font-display text-5xl font-semibold text-ink">{member.name}</h2>
                  {member.title && (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent">{member.title}</p>
                  )}
                  <div className="mt-6 space-y-4 leading-relaxed text-ink-soft">
                    {member.bio
                      .split(/\n\s*\n/)
                      .filter(Boolean)
                      .map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <BookingCta />
    </main>
  );
}
