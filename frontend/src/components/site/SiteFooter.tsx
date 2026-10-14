import Link from "next/link";

import { content } from "@/lib/content";
import { openingHoursRows } from "@/lib/site";

import { Logo } from "./Logo";
import { NAV } from "./SiteNav";

export async function SiteFooter() {
  const salon = await content.salon();
  return (
    <footer className="mt-24 border-t border-line/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 text-sm text-ink-soft sm:grid-cols-3 sm:px-8">
        <div>
          <Logo className="h-auto w-24 text-ink" title={salon?.name ?? "SIS Esthetics Hair"} />
          {salon && (
            <address className="mt-4 space-y-1 not-italic">
              <p>{salon.address}</p>
              <p>
                <a href={`tel:${salon.phone.replace(/\s/g, "")}`} className="hover:text-ink">
                  {salon.phone}
                </a>
              </p>
              {salon.email && (
                <p>
                  <a href={`mailto:${salon.email}`} className="hover:text-ink">
                    {salon.email}
                  </a>
                </p>
              )}
            </address>
          )}
        </div>
        {salon && (
          <div>
            <p className="font-semibold text-ink">Работно време</p>
            <dl className="mt-4 space-y-1">
              {openingHoursRows(salon.opening_hours).map(({ days, time }) => (
                <div key={days} className="flex gap-2">
                  <dt>{days}:</dt>
                  <dd>{time}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="hover:text-ink">
              {label}
            </Link>
          ))}
          <Link href="/obshti-usloviya" className="hover:text-ink">
            Общи условия
          </Link>
          <Link href="/poveritelnost" className="hover:text-ink">
            Поверителност
          </Link>
        </div>
      </div>
    </footer>
  );
}
