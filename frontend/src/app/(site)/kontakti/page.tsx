import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";

import { BookingCta } from "@/components/site/BookingCta";
import { PageHeader } from "@/components/site/PageHeader";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";
import { openingHoursRows } from "@/lib/site";

export const metadata: Metadata = {
  title: "Контакти",
  description: "Адрес, телефон и работно време на SIS Esthetics Hair в ж.к. Стрелбище, София.",
};

export default async function ContactsPage() {
  const salon = await content.salon();
  const socials = salon
    ? [
        { href: salon.facebook, label: "Facebook" },
        { href: salon.instagram, label: "Instagram" },
        { href: salon.tiktok, label: "TikTok" },
      ].filter((s) => s.href)
    : [];
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-8">
      <PageHeader eyebrow="Контакти" title="Заповядайте при нас" />
      {!salon ? (
        <Unavailable what="Контактите" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-6 rounded-[2rem] bg-surface/70 p-8 ring-1 ring-line">
            <p className="flex gap-4">
              <MapPin className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:text-accent"
              >
                {salon.address}
              </a>
            </p>
            <p className="flex gap-4">
              <Phone className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
              <a href={`tel:${salon.phone.replace(/\s/g, "")}`} className="text-ink hover:text-accent">
                {salon.phone}
              </a>
            </p>
            {salon.email && (
              <p className="flex gap-4">
                <Mail className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
                <a href={`mailto:${salon.email}`} className="break-all text-ink hover:text-accent">
                  {salon.email}
                </a>
              </p>
            )}
            {socials.length > 0 && (
              <p className="flex flex-wrap gap-2 pt-2">
                {socials.map(({ href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line hover:ring-accent"
                  >
                    {label}
                  </a>
                ))}
              </p>
            )}
          </section>
          <section className="rounded-[2rem] bg-surface/70 p-8 ring-1 ring-line">
            <h2 className="flex items-center gap-3 font-display text-3xl font-semibold text-ink">
              <Clock className="size-5 text-accent" aria-hidden />
              Работно време
            </h2>
            <dl className="mt-6 divide-y divide-line">
              {openingHoursRows(salon.opening_hours).map(({ days, time }) => (
                <div key={days} className="flex justify-between gap-4 py-3">
                  <dt className="text-ink-soft">{days}</dt>
                  <dd className="font-semibold text-ink">{time}</dd>
                </div>
              ))}
            </dl>
          </section>
          {salon.booking_policy && (
            <section className="rounded-[2rem] bg-surface-2 p-8 md:col-span-2">
              <h2 className="font-display text-3xl font-semibold text-ink">Условия при резервация</h2>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-ink-soft">{salon.booking_policy}</p>
            </section>
          )}
        </div>
      )}
      <BookingCta />
    </main>
  );
}
