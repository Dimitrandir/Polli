"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { specialistColor } from "@/lib/calendar";
import { addDays, startOfWeek, todayKey } from "@/lib/format";
import { staffApi, type MonthLoad } from "@/lib/staff-api";

const MONTHS = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];
const WEEKDAYS = ["П", "В", "С", "Ч", "П", "С", "Н"];

function monthKey(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Six weeks (Monday first) covering the month. */
export function monthGrid(first: string): string[] {
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // Drop a last week that is entirely in the next month.
  return days.slice(35)[0].slice(0, 7) !== first.slice(0, 7) ? days.slice(0, 35) : days;
}

/**
 * The month picker behind the date in the top bar, like Studio24: under every day a dot per specialist
 * in their colour; the bigger the dot, the busier the day.
 */
export function MonthPicker({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(monthKey(value));
  const [load, setLoad] = useState<MonthLoad | null>(null);
  const today = todayKey();

  useEffect(() => {
    let stale = false;
    staffApi
      .month(month)
      .then((data) => !stale && setLoad(data))
      .catch(() => !stale && setLoad(null));
    return () => {
      stale = true;
    };
  }, [month]);

  const days = useMemo(() => monthGrid(month), [month]);
  const specialists = load && load.month === month ? load.specialists : [];
  const [year, m] = month.split("-").map(Number);

  return (
    <>
      <button aria-label="Затвори календара" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Избери дата"
        className="absolute top-full left-2 z-50 mt-1 w-[min(24rem,calc(100vw-1rem))] rounded-xl bg-white p-3 text-neutral-900 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-lg font-bold">
            {MONTHS[m - 1]} {year}
          </span>
          <span className="flex gap-1">
            <button aria-label="Предишен месец" onClick={() => setMonth(shiftMonth(month, -1))} className="p-2">
              <ChevronLeft size={22} />
            </button>
            <button aria-label="Следващ месец" onClick={() => setMonth(shiftMonth(month, 1))} className="p-2">
              <ChevronRight size={22} />
            </button>
          </span>
        </div>
        <div className="grid grid-cols-7 text-center text-sm text-neutral-500">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-neutral-100">
          {days.map((day) => {
            const inMonth = day.slice(0, 7) === month.slice(0, 7);
            const loads = load?.days[day] ?? {};
            const selected = day === value;
            return (
              <button
                key={day}
                onClick={() => onPick(day)}
                aria-label={day}
                aria-pressed={selected}
                className="flex h-14 flex-col items-center gap-1 border-b border-r border-neutral-100 pt-1 last:border-r-0"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${
                    selected
                      ? "bg-[var(--staff)] font-bold text-white"
                      : day === today
                        ? "font-bold"
                        : inMonth
                          ? ""
                          : "text-neutral-300"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {inMonth && (
                  <span className="flex h-2.5 items-center justify-center gap-0.5">
                    {specialists.map((s, index) => {
                      const busy = loads[String(s.id)];
                      if (busy === undefined) return null;
                      const size = 3 + Math.round(busy * 7);
                      return (
                        <span
                          key={s.id}
                          title={`${s.name}: ${Math.round(busy * 100)}%`}
                          className="rounded-full"
                          style={{ width: size, height: size, background: specialistColor(s.color, index) }}
                        />
                      );
                    })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onPick(today)}
          className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-[var(--staff)] hover:bg-neutral-50"
        >
          Днес
        </button>
      </div>
    </>
  );
}
