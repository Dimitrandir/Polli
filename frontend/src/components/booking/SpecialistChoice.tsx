"use client";

import clsx from "clsx";
import { Layers, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import type { Action, BookingState, SpecialistChoice } from "@/lib/booking-state";

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** The specialists of a category, picked before its services so their own prices can be shown. */
export function SpecialistPicker({
  label,
  people,
  value,
  onChange,
}: {
  label: string;
  people: SpecialistChoice[];
  /** undefined = nobody picked yet. */
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}) {
  const options = [
    ...people.map((p) => ({ id: p.id as number | null, name: p.name, detail: "Услуги и цени" })),
    { id: null as number | null, name: "Без предпочитание", detail: "Първият свободен специалист" },
  ];
  // With a single specialist, "no preference" means the same person, so it is not shown.
  const visible = people.length === 1 ? options.slice(0, 1) : options;

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3">
      {visible.map((option) => {
        const checked = option.id === value;
        return (
          <motion.button
            key={option.id ?? "any"}
            role="radio"
            aria-checked={checked}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(option.id)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-2xl p-3 pr-5 text-left transition-all sm:w-auto sm:min-w-56",
              checked ? "bg-accent-soft ring-2 ring-accent" : "bg-surface ring-1 ring-line hover:ring-accent/50",
            )}
          >
            <span
              className={clsx(
                "grid size-11 place-items-center rounded-full text-sm font-bold",
                checked ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-soft",
              )}
            >
              {option.id === null ? <Sparkles className="size-4" /> : initials(option.name)}
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{option.name}</span>
              <span className="text-xs text-ink-soft">{option.detail}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** One after another or at the same time, for a booking with several services. */
export function ParallelChoice({ state, dispatch }: { state: BookingState; dispatch: (a: Action) => void }) {
  return (
    <div className="mt-10 rounded-3xl bg-surface p-6 ring-1 ring-line">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Layers className="size-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">Как да протекат услугите?</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Едновременно означава, че няколко специалисти работят по вас по едно и също време – например маникюр, докато
            боядисваме корените.
          </p>
          <div role="radiogroup" aria-label="Начин на изпълнение" className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              {
                value: false,
                title: "Една след друга",
                text: "Последователно",
              },
              { value: true, title: "Едновременно", text: "Спестява време" },
            ].map((option) => (
              <button
                key={String(option.value)}
                role="radio"
                aria-checked={state.parallel === option.value}
                onClick={() => dispatch({ type: "setParallel", parallel: option.value })}
                className={clsx(
                  "rounded-2xl px-4 py-3 text-left transition-all",
                  state.parallel === option.value
                    ? "bg-ink text-bg"
                    : "bg-surface-2 text-ink hover:ring-1 hover:ring-accent/50",
                )}
              >
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className={clsx("text-xs", state.parallel === option.value ? "text-bg/70" : "text-ink-soft")}>
                  {option.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
