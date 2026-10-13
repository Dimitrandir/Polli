"use client";

import clsx from "clsx";
import { Check, Clock, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Category, Service } from "@/lib/api";
import { type Action, type BookingState, MAX_SERVICES, offerFor } from "@/lib/booking-state";
import { formatDuration, formatPrice } from "@/lib/format";
import { itemRange, type MenuItem, menuItems, searchMenu } from "@/lib/services";

import { SearchField } from "../ui/SearchField";
import { StepHeading } from "./StepHeading";

export function ServicesStep({
  categories,
  state,
  dispatch,
}: {
  categories: Category[];
  state: BookingState;
  dispatch: (a: Action) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Until a tab is clicked, open the category of the first chosen service (e.g. one picked on /uslugi).
  const category =
    categories.find((c) => c.slug === active) ??
    categories.find((c) => c.slug === state.selected[0]?.category) ??
    categories[0];
  const selectedIds = new Set(state.selected.map((s) => s.id));
  const full = state.selected.length >= MAX_SERVICES;
  const results = query.trim() ? searchMenu(categories, query) : null;

  const cards = (items: MenuItem[]) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <ServiceCard
          key={item.key}
          item={item}
          selectedIds={selectedIds}
          full={full}
          onToggle={(service) => dispatch({ type: "toggleService", service })}
        />
      ))}
    </div>
  );

  return (
    <section>
      <StepHeading
        eyebrow="Стъпка 1"
        title="Изберете услуги"
        hint="Можете да добавите няколко услуги в една резервация."
      />

      <SearchField value={query} onChange={setQuery} className="mb-6" />

      {!results && (
        <div role="tablist" aria-label="Категории" className="mb-8 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.slug}
              role="tab"
              aria-selected={c.slug === category?.slug}
              onClick={() => setActive(c.slug)}
              className={clsx(
                "relative rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
                c.slug === category?.slug ? "text-bg" : "text-ink-soft hover:text-ink",
              )}
            >
              {c.slug === category?.slug && (
                <motion.span
                  layoutId="category-pill"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={results ? "search" : category?.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="space-y-10"
        >
          {results
            ? results.flatMap(({ category: c, groups }) =>
                groups.map(({ group, items }) => (
                  <div key={group.id}>
                    <GroupHeading name={group.name} count={items.length} category={c.name} />
                    {cards(items)}
                  </div>
                )),
              )
            : category?.groups.map((group) => {
                const items = menuItems(group);
                return (
                  <div key={group.id}>
                    <GroupHeading name={group.name} count={items.length} />
                    {cards(items)}
                  </div>
                );
              })}
          {results && results.length === 0 && (
            <p className="text-ink-soft">Няма услуги, които отговарят на „{query.trim()}“.</p>
          )}
          {!results && category && category.groups.length === 0 && (
            <p className="text-ink-soft">В тази категория все още няма услуги за онлайн резервация.</p>
          )}
        </motion.div>
      </AnimatePresence>
      {full && (
        <p className="mt-6 text-sm text-ink-soft">
          Една резервация може да съдържа до {MAX_SERVICES} услуги.
        </p>
      )}
    </section>
  );
}

function GroupHeading({ name, count, category }: { name: string; count: number; category?: string }) {
  return (
    <h3 className="mb-4 font-display text-2xl font-semibold text-ink">
      {category && <span className="mr-2 font-sans text-sm font-medium text-ink-soft">{category} ·</span>}
      {name}
      <span className="ml-2 align-middle font-sans text-xs font-medium text-ink-soft">{count}</span>
    </h3>
  );
}

const isBookable = (s: Service) => s.is_online_bookable && s.specialists.length > 0;

function ServiceCard({
  item,
  selectedIds,
  full,
  onToggle,
}: {
  item: MenuItem;
  selectedIds: Set<number>;
  full: boolean;
  onToggle: (service: Service) => void;
}) {
  const selected = item.options.some((o) => selectedIds.has(o.id));
  // Switching to another option of an already chosen service is always allowed.
  const blocked = full && !selected;
  const bookable = item.options.some(isBookable);
  const frame = clsx(
    "group relative flex h-full flex-col rounded-3xl p-5 text-left transition-all duration-300",
    selected
      ? "bg-accent-soft ring-2 ring-accent shadow-[0_18px_40px_-24px_var(--accent)]"
      : "bg-surface ring-1 ring-line",
    (blocked || !bookable) && "opacity-50",
  );

  if (item.options.length === 1) {
    const service = item.options[0];
    const offer = offerFor(service, null);
    return (
      <motion.button
        layout
        whileTap={{ scale: 0.98 }}
        onClick={() => onToggle(service)}
        disabled={blocked || !bookable}
        aria-pressed={selected}
        className={clsx(
          frame,
          !selected && "hover:-translate-y-0.5 hover:ring-accent/50 hover:shadow-[0_18px_40px_-28px_rgba(34,27,23,0.5)]",
          (blocked || !bookable) && "cursor-not-allowed hover:translate-y-0",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="font-semibold leading-snug text-ink">{item.name}</span>
          <ToggleMark selected={selected} />
        </div>
        {item.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-ink-soft">
            <Clock className="size-3.5" />
            {formatDuration(offer.duration)}
          </span>
          <span className="font-semibold text-ink">
            {offer.from && <span className="mr-1 font-normal text-ink-soft">от</span>}
            {formatPrice(offer.price)}
          </span>
        </div>
        {!bookable && <span className="mt-2 text-xs text-ink-soft">Само по телефона</span>}
      </motion.button>
    );
  }

  const range = itemRange(item, (s) => offerFor(s, null).price);
  return (
    <motion.div layout role="group" aria-label={item.name} className={frame}>
      <div className="flex items-start justify-between gap-4">
        <span className="font-semibold leading-snug text-ink">{item.name}</span>
        <span className="shrink-0 text-sm font-semibold text-ink">
          <span className="mr-1 font-normal text-ink-soft">от</span>
          {formatPrice(range.minPrice)}
        </span>
      </div>
      {item.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{item.description}</p>
      )}
      <ul className="mt-3 space-y-1.5">
        {item.options.map((option) => {
          const offer = offerFor(option, null);
          const on = selectedIds.has(option.id);
          const disabled = !isBookable(option) || (blocked && !on);
          return (
            <li key={option.id}>
              <button
                onClick={() => onToggle(option)}
                disabled={disabled}
                aria-pressed={on}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                  on ? "bg-accent text-accent-ink" : "bg-surface-2/70 text-ink hover:bg-surface-2",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="min-w-0 flex-1 font-medium">{option.option}</span>
                <span className={clsx("shrink-0 tabular-nums", on ? "text-accent-ink/80" : "text-ink-soft")}>
                  {formatDuration(offer.duration)}
                </span>
                <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{formatPrice(offer.price)}</span>
                {on ? (
                  <Check className="size-4 shrink-0" strokeWidth={2.5} />
                ) : (
                  <Plus className="size-4 shrink-0 opacity-60" strokeWidth={2.5} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!bookable && <span className="mt-2 text-xs text-ink-soft">Само по телефона</span>}
    </motion.div>
  );
}

function ToggleMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
        selected ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-soft group-hover:bg-ink group-hover:text-bg",
      )}
    >
      {selected ? <Check className="size-4" strokeWidth={2.5} /> : <Plus className="size-4" strokeWidth={2.5} />}
    </span>
  );
}
