"use client";

import { Plus, X } from "lucide-react";

import type { Hours } from "@/lib/staff-api";

import { inputClass } from "./Sheet";

const DAYS = ["Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота", "Неделя"];

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toClock(minutes: number) {
  const m = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Splits the longest interval of a day in two with a one-hour break in the middle. */
export function addBreak(day: Hours[]): Hours[] {
  if (!day.length) return day;
  const longest = day.reduce((a, b) => (toMinutes(b.end) - toMinutes(b.start) > toMinutes(a.end) - toMinutes(a.start) ? b : a));
  const start = toMinutes(longest.start);
  const end = toMinutes(longest.end);
  if (end - start < 120) return day;
  const middle = Math.round((start + end) / 2 / 30) * 30;
  return day
    .flatMap((h) =>
      h === longest
        ? [
            { ...h, end: toClock(middle - 30) },
            { ...h, start: toClock(middle + 30) },
          ]
        : [h],
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The week as Studio24 shows it: a row per day with the working intervals.
 * Two intervals on a day mean a break between them.
 */
export function HoursEditor({
  value,
  onChange,
  disabled,
  defaultDay = { start: "09:00", end: "18:00" },
}: {
  value: Hours[];
  onChange: (hours: Hours[]) => void;
  disabled?: boolean;
  defaultDay?: { start: string; end: string };
}) {
  const byDay = DAYS.map((_, weekday) =>
    value.filter((h) => h.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start)),
  );

  function setDay(weekday: number, day: Hours[]) {
    onChange([...value.filter((h) => h.weekday !== weekday), ...day]);
  }

  return (
    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
      {byDay.map((day, weekday) => {
        const working = day.length > 0;
        return (
          <li key={weekday} className="px-3 py-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-medium text-neutral-900">
                <input
                  type="checkbox"
                  checked={working}
                  disabled={disabled}
                  onChange={(e) => setDay(weekday, e.target.checked ? [{ weekday, ...defaultDay }] : [])}
                  className="h-5 w-5 accent-[var(--staff)]"
                />
                {DAYS[weekday]}
              </label>
              {working ? (
                !disabled && (
                  <button
                    type="button"
                    onClick={() => setDay(weekday, addBreak(day))}
                    className="inline-flex items-center gap-1 text-sm text-[var(--staff)]"
                  >
                    <Plus size={14} /> почивка
                  </button>
                )
              ) : (
                <span className="text-sm text-neutral-400">почива</span>
              )}
            </div>
            {day.map((h, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  step={300}
                  aria-label={`${DAYS[weekday]} от`}
                  value={h.start}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value && setDay(weekday, day.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                  }
                  className={`${inputClass} py-1.5`}
                />
                <span className="text-neutral-400">–</span>
                <input
                  type="time"
                  step={300}
                  aria-label={`${DAYS[weekday]} до`}
                  value={h.end}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value && setDay(weekday, day.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                  }
                  className={`${inputClass} py-1.5`}
                />
                {day.length > 1 && !disabled && (
                  <button
                    type="button"
                    aria-label="Махни интервала"
                    onClick={() => setDay(weekday, day.filter((_, j) => j !== i))}
                    className="p-1 text-neutral-500"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {day.length > 1 && (
              <p className="mt-1 text-xs text-neutral-500">
                Почивка:{" "}
                {day
                  .slice(1)
                  .map((h, i) => `${day[i].end}–${h.start}`)
                  .join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
