"use client";

import clsx from "clsx";
import { ArrowRight, CalendarCheck, Clock, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { type Action, type BookingState, canContinue, estimate, offerFor } from "@/lib/booking-state";
import { formatDuration, formatLongDate, formatPrice, formatTime } from "@/lib/format";
import { serviceLabel } from "@/lib/services";

import { Button } from "../ui/Button";

type Props = { state: BookingState; dispatch: (a: Action) => void; onNext: () => void };

function totals(state: BookingState) {
  if (state.slot) {
    const minutes = (new Date(state.slot.end).getTime() - new Date(state.slot.start).getTime()) / 60000;
    return { price: Number(state.slot.total_price), duration: minutes, from: false };
  }
  return estimate(state);
}

function nextLabel(state: BookingState) {
  return state.step === "time" ? "Към данните" : "Продължи";
}

/** Sticky panel on desktop. */
export function Summary({ state, dispatch, onNext }: Props) {
  const total = totals(state);
  const showNext = state.step !== "details";
  return (
    <aside className="sticky top-28 hidden self-start rounded-[2rem] bg-surface/80 p-7 shadow-[0_30px_80px_-40px_rgba(34,27,23,0.45)] ring-1 ring-line backdrop-blur-xl lg:block">
      <h2 className="font-display text-2xl font-semibold text-ink">Вашата резервация</h2>

      {state.selected.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Изберете поне една услуга, за да продължите.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {state.selected.map((service) => {
              const planned = state.slot?.items.find((i) => i.service === service.id);
              const offer = offerFor(service, state.specialists[service.id] ?? null);
              const specialist =
                planned?.specialist_name ??
                service.specialists.find((o) => o.id === state.specialists[service.id])?.name;
              return (
                <motion.li
                  key={service.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex items-start justify-between gap-3 overflow-hidden"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{serviceLabel(service)}</p>
                    <p className="text-xs text-ink-soft">
                      {specialist ?? "Без предпочитание"}
                      {planned && ` · ${formatTime(planned.start)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-ink">
                      {planned ? formatPrice(planned.price) : `${offer.from ? "от " : ""}${formatPrice(offer.price)}`}
                    </span>
                    {state.step !== "details" && (
                      <button
                        aria-label={`Премахни ${serviceLabel(service)}`}
                        onClick={() => dispatch({ type: "removeService", id: service.id })}
                        className="rounded-full p-1 text-ink-soft opacity-60 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {state.slot && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-accent-soft p-4 text-sm text-ink">
          <CalendarCheck className="size-5 text-accent" />
          <span>
            <span className="block font-semibold">{formatLongDate(state.slot.start)}</span>
            {formatTime(state.slot.start)} – {formatTime(state.slot.end)}
          </span>
        </div>
      )}

      {state.selected.length > 0 && (
        <div className="mt-6 space-y-2 border-t border-line pt-5 text-sm">
          <div className="flex justify-between text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> Продължителност
            </span>
            <span>{formatDuration(total.duration)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-ink">Общо</span>
            <span className="font-display text-3xl font-semibold text-ink">
              {total.from && <span className="mr-1 font-sans text-sm font-normal text-ink-soft">от</span>}
              {formatPrice(total.price)}
            </span>
          </div>
          <p className="text-xs text-ink-soft">Плащане на място</p>
        </div>
      )}

      {showNext && (
        <Button onClick={onNext} disabled={!canContinue(state)} className="mt-6 w-full">
          {nextLabel(state)} <ArrowRight className="size-4" />
        </Button>
      )}
    </aside>
  );
}

/** Bottom bar on phones and tablets. */
export function MobileBar({ state, onNext }: Omit<Props, "dispatch">) {
  if (state.step === "details" || state.selected.length === 0) return null;
  const total = totals(state);
  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-soft">
            {state.selected.length} {state.selected.length === 1 ? "услуга" : "услуги"} · {formatDuration(total.duration)}
            {state.slot && ` · ${formatTime(state.slot.start)}`}
          </p>
          <p className="font-display text-2xl font-semibold text-ink">
            {total.from && <span className="mr-1 font-sans text-xs font-normal text-ink-soft">от</span>}
            {formatPrice(total.price)}
          </p>
        </div>
        <Button onClick={onNext} disabled={!canContinue(state)} className={clsx("shrink-0")}>
          {nextLabel(state)} <ArrowRight className="size-4" />
        </Button>
      </div>
    </motion.div>
  );
}
