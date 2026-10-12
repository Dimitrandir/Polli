import type { Metadata } from "next";

import { BookingCta } from "@/components/site/BookingCta";
import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import type { Service } from "@/lib/api";
import { content } from "@/lib/content";
import { formatDuration, formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Услуги и цени",
  description: "Подстригване, стайлинг, боядисване, кичури, балеаж, терапии за коса, маникюр и педикюр.",
};

/** "45,00 €", or "от 40,39 €" when specialists charge differently. */
function priceLabel(service: Service): string {
  const prices = service.specialists.length ? service.specialists.map((s) => Number(s.price)) : [Number(service.price)];
  const min = Math.min(...prices);
  return min === Math.max(...prices) ? formatPrice(min) : `от ${formatPrice(min)}`;
}

export default async function ServicesPage() {
  const categories = await content.categories();
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-8">
      <PageHeader eyebrow="Услуги" title="Услуги и цени">
        Цената може леко да се различава според специалиста. Точната сума виждате при резервацията.
      </PageHeader>
      {!categories ? (
        <Unavailable what="Услугите" />
      ) : (
        <div className="space-y-16">
          {categories.map((category) => (
            <section key={category.id} aria-labelledby={`cat-${category.slug}`}>
              <h2 id={`cat-${category.slug}`} className="font-display text-4xl font-semibold text-ink">
                {category.name}
              </h2>
              <div className="mt-8 grid gap-6">
                {category.groups.map((group) => (
                  <article key={group.id} className="rounded-[2rem] bg-surface/70 p-6 ring-1 ring-line sm:p-8">
                    <h3 className="font-display text-3xl font-semibold text-ink">{group.name}</h3>
                    {group.description && (
                      <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-soft">{group.description}</p>
                    )}
                    <ul className="mt-6 divide-y divide-line">
                      {group.services.map((service) => (
                        <li key={service.id} className="flex items-baseline justify-between gap-6 py-4">
                          <div>
                            <p className="font-semibold text-ink">{service.name}</p>
                            {service.description && (
                              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{service.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-semibold text-ink">{priceLabel(service)}</p>
                            <p className="text-sm text-ink-soft">{formatDuration(service.duration_minutes)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <BookingCta />
    </main>
  );
}
