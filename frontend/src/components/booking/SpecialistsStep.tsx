"use client";

import clsx from "clsx";
import { Layers, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import type { Service } from "@/lib/api";
import type { Action, BookingState } from "@/lib/booking-state";
import { formatDuration, formatPrice } from "@/lib/format";
import { serviceLabel } from "@/lib/services";

import { StepHeading } from "./StepHeading";

export function SpecialistsStep({ state, dispatch }: { state: BookingState; dispatch: (a: Action) => void }) {
  return (
    <section>
      <StepHeading
        eyebrow="Стъпка 2"
        title="При кого?"
        hint="Изберете специалист или оставете „Без предпочитание“ – ще ви предложим най-ранните свободни часове."
      />

      <div className="space-y-8">
        {state.selected.map((service) => (
          <SpecialistPicker
            key={service.id}
            service={service}
            value={state.specialists[service.id] ?? null}
            onChange={(id) => dispatch({ type: "setSpecialist", serviceId: service.id, specialistId: id })}
          />
        ))}
      </div>

      {state.selected.length > 1 && (
        <div className="mt-10 rounded-3xl bg-surface p-6 ring-1 ring-line">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Layers className="size-5" />
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-ink">Как да протекат услугите?</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Едновременно означава, че няколко специалисти работят по вас по едно и също време – например маникюр,
                докато боядисваме корените.
              </p>
              <div role="radiogroup" aria-label="Начин на изпълнение" className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  { value: false, title: "Една след друга", text: "Последователно" },
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
      )}
    </section>
  );
}

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

function SpecialistPicker({
  service,
  value,
  onChange,
}: {
  service: Service;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const options = [
    { id: null as number | null, name: "Без предпочитание", detail: "Първият свободен специалист" },
    ...service.specialists.map((o) => ({
      id: o.id as number | null,
      name: o.name,
      detail: `${formatPrice(o.price)} · ${formatDuration(o.duration_minutes)}`,
    })),
  ];
  // With a single specialist, "no preference" means the same person, so it is not shown.
  const visible = service.specialists.length === 1 ? options.slice(1) : options;

  return (
    <div>
      <h3 className="mb-3 font-display text-2xl font-semibold text-ink">{serviceLabel(service)}</h3>
      <div role="radiogroup" aria-label={`Специалист за ${serviceLabel(service)}`} className="flex flex-wrap gap-3">
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
                "flex min-w-56 items-center gap-3 rounded-2xl p-3 pr-5 text-left transition-all",
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
    </div>
  );
}
