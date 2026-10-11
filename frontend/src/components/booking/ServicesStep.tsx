"use client";

import clsx from "clsx";
import { Check, Clock, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Category, Service } from "@/lib/api";
import { type Action, type BookingState, MAX_SERVICES, offerFor } from "@/lib/booking-state";
import { formatDuration, formatPrice } from "@/lib/format";

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
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const category = categories.find((c) => c.slug === active) ?? categories[0];
  const selectedIds = new Set(state.selected.map((s) => s.id));
  const full = state.selected.length >= MAX_SERVICES;

  return (
    <section>
      <StepHeading
        eyebrow="Стъпка 1"
        title="Изберете услуги"
        hint="Можете да добавите няколко услуги в една резервация."
      />

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

      <AnimatePresence mode="wait">
        <motion.div
          key={category?.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="space-y-10"
        >
          {category?.groups.map((group) => (
            <div key={group.id}>
              <h3 className="mb-4 font-display text-2xl font-semibold text-ink">
                {group.name}
                <span className="ml-2 align-middle font-sans text-xs font-medium text-ink-soft">
                  {group.services.length}
                </span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.services.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    selected={selectedIds.has(service.id)}
                    disabled={full && !selectedIds.has(service.id)}
                    onToggle={() => dispatch({ type: "toggleService", service })}
                  />
                ))}
              </div>
            </div>
          ))}
          {category && category.groups.length === 0 && (
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

function ServiceCard({
  service,
  selected,
  disabled,
  onToggle,
}: {
  service: Service;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const offer = offerFor(service, null);
  const bookable = service.is_online_bookable && service.specialists.length > 0;
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      disabled={disabled || !bookable}
      aria-pressed={selected}
      className={clsx(
        "group relative flex h-full flex-col rounded-3xl p-5 text-left transition-all duration-300",
        selected
          ? "bg-accent-soft ring-2 ring-accent shadow-[0_18px_40px_-24px_var(--accent)]"
          : "bg-surface ring-1 ring-line hover:-translate-y-0.5 hover:ring-accent/50 hover:shadow-[0_18px_40px_-28px_rgba(34,27,23,0.5)]",
        (disabled || !bookable) && "cursor-not-allowed opacity-50 hover:translate-y-0",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="font-semibold leading-snug text-ink">{service.name}</span>
        <span
          className={clsx(
            "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
            selected ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-soft group-hover:bg-ink group-hover:text-bg",
          )}
        >
          {selected ? <Check className="size-4" strokeWidth={2.5} /> : <Plus className="size-4" strokeWidth={2.5} />}
        </span>
      </div>
      {service.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{service.description}</p>
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
