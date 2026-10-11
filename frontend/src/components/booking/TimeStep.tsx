"use client";

import clsx from "clsx";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type Availability, api, ApiError, type Slot } from "@/lib/api";
import { type Action, type BookingState, itemRequests } from "@/lib/booking-state";
import { addDays, formatLongDate, formatTime, salonHour, startOfWeek, todayKey, weekdayParts } from "@/lib/format";

import { Skeleton } from "../ui/Skeleton";
import { StepHeading } from "./StepHeading";

const PARTS_OF_DAY = [
  { label: "Сутрин", test: (h: number) => h < 12 },
  { label: "Следобед", test: (h: number) => h >= 12 && h < 17 },
  { label: "Вечер", test: (h: number) => h >= 17 },
];

type Load = { key: string; data?: Availability; error?: string };

export function TimeStep({
  state,
  dispatch,
  notice,
}: {
  state: BookingState;
  dispatch: (a: Action) => void;
  notice?: string | null;
}) {
  const items = useMemo(() => itemRequests(state), [state]);
  const requestKey = JSON.stringify([state.weekStart, state.parallel, items, state.version]);
  const [load, setLoad] = useState<Load>({ key: "" });
  const loading = load.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    api
      .availability({ date: state.weekStart, days: 7, parallel: state.parallel, items })
      .then((data) => !cancelled && setLoad({ key: requestKey, data }))
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoad({ key: requestKey, error: e instanceof ApiError ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
    // requestKey captures every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const days = useMemo(() => load.data?.days ?? [], [load.data]);
  const today = todayKey();

  // When the step opens on a week without free times (e.g. on a Sunday evening),
  // jump ahead a few weeks on its own instead of showing an empty calendar.
  const autoAdvance = useRef(state.day === null ? 4 : 0);
  useEffect(() => {
    if (loading || load.error || days.some((d) => d.slots.length > 0) || autoAdvance.current <= 0) return;
    autoAdvance.current -= 1;
    dispatch({ type: "setWeek", weekStart: addDays(state.weekStart, 7) });
  }, [loading, load.error, days, state.weekStart, dispatch]);

  // Pick the first day with free times once a week has loaded.
  useEffect(() => {
    if (loading || state.day) return;
    const first = days.find((d) => d.slots.length > 0);
    if (first) dispatch({ type: "selectDay", day: first.date });
  }, [loading, days, state.day, dispatch]);

  const current = days.find((d) => d.date === state.day);
  const canGoBack = state.weekStart > startOfWeek(today);
  const weekHasSlots = days.some((d) => d.slots.length > 0);

  return (
    <section>
      <StepHeading eyebrow="Стъпка 3" title="Кога ви е удобно?" hint="Показваме само часовете, в които всичко избрано е свободно." />

      {notice && (
        <p role="alert" className="mb-6 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-2xl font-semibold text-ink">
          {weekLabel(state.weekStart)}
        </p>
        <div className="flex gap-2">
          <IconButton
            label="Предишна седмица"
            disabled={!canGoBack || loading}
            onClick={() => {
              autoAdvance.current = 0;
              dispatch({ type: "setWeek", weekStart: addDays(state.weekStart, -7) });
            }}
          >
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton
            label="Следваща седмица"
            disabled={loading}
            onClick={() => {
              autoAdvance.current = 0;
              dispatch({ type: "setWeek", weekStart: addDays(state.weekStart, 7) });
            }}
          >
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
        {Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i)).map((date) => {
          const day = days.find((d) => d.date === date);
          const count = day?.slots.length ?? 0;
          const selected = state.day === date;
          const parts = weekdayParts(date);
          const past = date < today;
          return (
            <button
              key={date}
              disabled={loading || !count}
              onClick={() => dispatch({ type: "selectDay", day: date })}
              aria-pressed={selected}
              aria-label={`${formatLongDate(date)}${count ? `, ${count} свободни часа` : ", няма свободни часове"}`}
              className={clsx(
                "relative flex flex-col items-center rounded-2xl py-3 transition-all sm:py-4",
                selected
                  ? "bg-ink text-bg shadow-[0_14px_30px_-16px_rgba(34,27,23,0.7)]"
                  : count
                    ? "bg-surface text-ink ring-1 ring-line hover:ring-accent/60"
                    : "text-ink-soft/50",
                past && "opacity-40",
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{parts.weekday}</span>
              <span className="mt-1 text-xl font-semibold sm:text-2xl">{parts.day}</span>
              <span className="text-[11px] opacity-60">{parts.month}</span>
              {!loading && count > 0 && (
                <span className={clsx("mt-2 size-1.5 rounded-full", selected ? "bg-gold" : "bg-accent")} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-10 min-h-64">
        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : load.error ? (
          <p role="alert" className="rounded-2xl bg-surface p-6 text-danger ring-1 ring-line">
            {load.error}
          </p>
        ) : !weekHasSlots ? (
          <EmptyWeek onNext={() => dispatch({ type: "setWeek", weekStart: addDays(state.weekStart, 7) })} />
        ) : (
          current && (
            <AnimatePresence mode="wait">
              <motion.div
                key={current.date}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
              >
                <p className="mb-6 text-sm font-semibold text-ink-soft">{formatLongDate(current.date)}</p>
                <SlotGrid
                  slots={current.slots}
                  selected={state.slot}
                  onSelect={(slot) => dispatch({ type: "selectSlot", slot })}
                />
              </motion.div>
            </AnimatePresence>
          )
        )}
      </div>
    </section>
  );
}

function SlotGrid({ slots, selected, onSelect }: { slots: Slot[]; selected: Slot | null; onSelect: (s: Slot) => void }) {
  return (
    <div className="space-y-8">
      {PARTS_OF_DAY.map((part) => {
        const group = slots.filter((s) => part.test(salonHour(s.start)));
        if (!group.length) return null;
        return (
          <div key={part.label}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">{part.label}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {group.map((slot) => {
                const isSelected = selected?.start === slot.start;
                return (
                  <motion.button
                    key={slot.start}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelect(slot)}
                    aria-pressed={isSelected}
                    className={clsx(
                      "rounded-xl py-3 text-sm font-semibold tabular-nums transition-all",
                      isSelected
                        ? "bg-accent text-accent-ink shadow-[0_10px_24px_-12px_var(--accent)]"
                        : "bg-surface text-ink ring-1 ring-line hover:ring-accent/60",
                    )}
                  >
                    {formatTime(slot.start)}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyWeek({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-12 text-center ring-1 ring-line">
      <CalendarX className="size-8 text-accent" />
      <p className="mt-4 font-semibold text-ink">Няма свободни часове тази седмица</p>
      <p className="mt-1 text-sm text-ink-soft">Опитайте следващата седмица или изберете друг специалист.</p>
      <button onClick={onNext} className="mt-5 text-sm font-semibold text-accent underline-offset-4 hover:underline">
        Следваща седмица →
      </button>
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full bg-surface text-ink ring-1 ring-line transition hover:ring-accent/60 disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function weekLabel(weekStart: string) {
  const end = addDays(weekStart, 6);
  const a = weekdayParts(weekStart);
  const b = weekdayParts(end);
  return a.month === b.month ? `${a.day} – ${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}
