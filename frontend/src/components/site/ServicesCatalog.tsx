"use client";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Category, Service } from "@/lib/api";
import { formatDuration, formatPrice } from "@/lib/format";
import { type MenuItem, searchMenu, serviceLabel } from "@/lib/services";

import { SearchField } from "../ui/SearchField";

/** "45,00 €", or "от 40,39 €" when specialists charge differently. */
function priceLabel(service: Service): string {
  const prices = service.specialists.length ? service.specialists.map((s) => Number(s.price)) : [Number(service.price)];
  const min = Math.min(...prices);
  return min === Math.max(...prices) ? formatPrice(min) : `от ${formatPrice(min)}`;
}

const isBookable = (s: Service) => s.is_online_bookable && s.specialists.length > 0;

/** The price list with a search box; every service links to the booking with it already chosen. */
export function ServicesCatalog({ categories }: { categories: Category[] }) {
  const [query, setQuery] = useState("");
  const menu = searchMenu(categories, query);
  const searching = query.trim() !== "";

  return (
    <div>
      <SearchField value={query} onChange={setQuery} className="mb-12 max-w-xl" />
      {menu.length === 0 && <p className="text-ink-soft">Няма услуги, които отговарят на „{query.trim()}“.</p>}
      <div className="space-y-16">
        {menu.map(({ category, groups }) => (
          <section key={category.id} aria-labelledby={`cat-${category.slug}`}>
            <h2 id={`cat-${category.slug}`} className="font-display text-4xl font-semibold text-ink">
              {category.name}
            </h2>
            <div className="mt-8 grid gap-6">
              {groups.map(({ group, items }) => (
                <article key={group.id} className="rounded-[2rem] bg-surface/70 p-6 ring-1 ring-line sm:p-8">
                  <h3 className="font-display text-3xl font-semibold text-ink">{group.name}</h3>
                  {group.description && !searching && (
                    <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-soft">{group.description}</p>
                  )}
                  <ul className="mt-6 divide-y divide-line">
                    {items.map((item) => (
                      <ServiceRow key={item.key} item={item} />
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ServiceRow({ item }: { item: MenuItem }) {
  const single = item.options.length === 1 ? item.options[0] : null;
  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between gap-6">
        <div>
          <p className="font-semibold text-ink">{item.name}</p>
          {item.description && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.description}</p>}
        </div>
        {single && <PriceAndBook service={single} />}
      </div>
      {!single && (
        <ul className="mt-2 space-y-1">
          {item.options.map((option) => (
            <li key={option.id} className="flex items-baseline justify-between gap-6 pl-4 text-sm">
              <span className="text-ink-soft">{option.option}</span>
              <PriceAndBook service={option} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PriceAndBook({ service }: { service: Service }) {
  return (
    <div className="flex shrink-0 items-center gap-4 text-right">
      <div>
        <p className="font-semibold text-ink">{priceLabel(service)}</p>
        <p className="text-sm text-ink-soft">{formatDuration(service.duration_minutes)}</p>
      </div>
      {isBookable(service) ? (
        <Link
          href={`/rezervacia?usluga=${service.id}`}
          aria-label={`Запази час за ${serviceLabel(service)}`}
          title="Запази час"
          className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-ink hover:text-bg"
        >
          <CalendarPlus className="size-4" />
        </Link>
      ) : (
        <span title="Само по телефона" className="grid size-9 place-items-center text-xs text-ink-soft">
          тел.
        </span>
      )}
    </div>
  );
}
