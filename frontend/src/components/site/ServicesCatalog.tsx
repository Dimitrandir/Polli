"use client";

import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Category, Service } from "@/lib/api";
import { formatDuration, formatPrice } from "@/lib/format";
import { type MenuItem, searchMenu, serviceLabel, toggleId } from "@/lib/services";

import { Collapsible } from "../ui/Collapsible";
import { SearchField } from "../ui/SearchField";

const pricesOf = (service: Service) =>
  service.specialists.length ? service.specialists.map((s) => Number(s.price)) : [Number(service.price)];

/** "45,00 €", or "от 40,39 €" when specialists charge differently. */
function priceLabel(service: Service): string {
  const prices = pricesOf(service);
  const min = Math.min(...prices);
  return min === Math.max(...prices) ? formatPrice(min) : `от ${formatPrice(min)}`;
}

/** The lowest price in a group, for "от 20,00 €" next to its name. */
const lowestPrice = (items: MenuItem[]) => Math.min(...items.flatMap((i) => i.options.flatMap(pricesOf)));

const isBookable = (s: Service) => s.is_online_bookable && s.specialists.length > 0;

/**
 * The price list with a search box. Each group is a card with its description that opens to show
 * its services; every service links to the booking with it already chosen.
 */
export function ServicesCatalog({ categories }: { categories: Category[] }) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
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
                <Collapsible
                  key={group.id}
                  // Search results are always shown open.
                  open={searching || openIds.has(group.id)}
                  onToggle={() => setOpenIds((ids) => toggleId(ids, group.id))}
                  className="rounded-[2rem] bg-surface/70 p-6 ring-1 ring-line sm:p-8"
                  header={
                    <>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <span className="font-display text-3xl font-semibold text-ink">
                          {group.name}
                          <span className="ml-2 align-middle font-sans text-sm font-medium text-ink-soft">
                            {items.length}
                          </span>
                        </span>
                        <span className="text-sm text-ink-soft">
                          от <span className="font-semibold text-ink">{formatPrice(lowestPrice(items))}</span>
                        </span>
                      </span>
                      {group.description && !searching && (
                        <span className="mt-3 block whitespace-pre-line leading-relaxed text-ink-soft">
                          {group.description}
                        </span>
                      )}
                    </>
                  }
                >
                  <ul className="mt-6 divide-y divide-line">
                    {items.map((item) => (
                      <ServiceRow key={item.key} item={item} />
                    ))}
                  </ul>
                </Collapsible>
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
