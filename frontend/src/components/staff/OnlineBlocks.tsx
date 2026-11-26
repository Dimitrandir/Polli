"use client";

import { ChevronLeft, ChevronRight, PhoneOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { addDays, formatLongDate, todayKey, weekdayParts } from "@/lib/format";
import { staffApi, type OnlineBlock, type OnlineBlocks } from "@/lib/staff-api";

import { monthGrid, monthKey, MONTHS, shiftMonth, WEEKDAYS } from "./MonthPicker";
import { Field, inputClass, Sheet } from "./Sheet";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");

/** "" = the whole salon, else a specialist id: what a select box can hold. */
type Scope = "" | `${number}`;

const toSpecialist = (scope: Scope) => (scope === "" ? null : Number(scope));

/** Whose online booking the signed-in team member may stop: the salon (administrators) and themselves. */
function scopes(data: OnlineBlocks): { value: Scope; label: string }[] {
  return [
    ...(data.can_block_salon ? [{ value: "" as Scope, label: "Целият салон" }] : []),
    ...data.specialists.filter((s) => s.can_manage).map((s) => ({ value: `${s.id}` as Scope, label: s.name })),
  ];
}

function whoLabel(block: OnlineBlock, data: OnlineBlocks) {
  if (block.specialist === null) return "Целият салон";
  return data.specialists.find((s) => s.id === block.specialist)?.name ?? "Служител";
}

function shortDate(date: string) {
  const p = weekdayParts(date);
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/**
 * Settings → "Дни без онлайн записване": tap days in a month to close them for online booking,
 * or close a whole period (a holiday). Every change is saved at once.
 */
export function OnlineBlocksSection() {
  const today = todayKey();
  const [data, setData] = useState<OnlineBlocks | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [month, setMonth] = useState(monthKey(today));
  const [message, setMessage] = useState("");
  const [range, setRange] = useState({ from: today, to: today });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await staffApi.onlineBlocks(today, addDays(today, 366));
      setData(next);
      setScope((current) => current ?? scopes(next)[0]?.value ?? null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(() => (data ? scopes(data) : []), [data]);
  const specialist = scope === null ? null : toSpecialist(scope);
  const mine = useMemo(
    () => new Map((data?.blocks ?? []).filter((b) => b.specialist === specialist).map((b) => [b.date, b])),
    [data, specialist],
  );
  const salonDays = useMemo(
    () => new Set((data?.blocks ?? []).filter((b) => b.specialist === null).map((b) => b.date)),
    [data],
  );

  async function change(dates: string[], blocked: boolean) {
    if (scope === null || !dates.length) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi.setOnlineBlocks({ dates, specialist: toSpecialist(scope), blocked, message: message.trim() });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(block: OnlineBlock) {
    setBusy(true);
    setError(null);
    try {
      await staffApi.setOnlineBlocks({ dates: [block.date], specialist: block.specialist, blocked: false });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function period(): string[] {
    const from = range.from < today ? today : range.from;
    const dates: string[] = [];
    for (let d = from; d <= range.to && dates.length < 366; d = addDays(d, 1)) dates.push(d);
    return dates;
  }

  if (!data) {
    return error ? (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    ) : (
      <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
    );
  }

  const days = monthGrid(month);
  const [year, m] = month.split("-").map(Number);
  const canGoBack = month > monthKey(today);
  const manageable = (b: OnlineBlock) =>
    b.specialist === null ? data.can_block_salon : !!data.specialists.find((s) => s.id === b.specialist)?.can_manage;

  return (
    <section className="space-y-3" aria-label="Дни без онлайн записване">
      <h2 className="text-base font-bold">Дни без онлайн записване</h2>
      <p className="text-sm text-neutral-600">
        В тези дни клиентите не могат да си запишат час онлайн (сайт и AI асистент). Виждат текста от настройките с
        бутон за обаждане. Вие записвате от календара както винаги, а вече записаните часове остават.
      </p>

      {options.length > 1 ? (
        <Field label="За кого">
          <select
            value={scope ?? ""}
            onChange={(e) => setScope(e.target.value as Scope)}
            className={inputClass}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      ) : options.length === 1 ? (
        <p className="text-sm">
          За: <strong>{options[0].label}</strong>
        </p>
      ) : (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Само администратор или самият служител може да спира онлайн записването.
        </p>
      )}

      {scope !== null && (
        <>
          <Field label="Собствен текст за новите дни (по желание)">
            <input
              value={message}
              maxLength={255}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={data.default_message}
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl border border-neutral-200 p-2">
            <div className="mb-1 flex items-center justify-between px-2">
              <span className="font-bold">
                {MONTHS[m - 1]} {year}
              </span>
              <span className="flex gap-1">
                <button
                  aria-label="Предишен месец"
                  disabled={!canGoBack}
                  onClick={() => setMonth(shiftMonth(month, -1))}
                  className="p-2 disabled:opacity-30"
                >
                  <ChevronLeft size={20} />
                </button>
                <button aria-label="Следващ месец" onClick={() => setMonth(shiftMonth(month, 1))} className="p-2">
                  <ChevronRight size={20} />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-neutral-500">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const inMonth = day.slice(0, 7) === month.slice(0, 7);
                const past = day < today;
                const blocked = mine.has(day);
                const bySalon = specialist !== null && salonDays.has(day);
                return (
                  <button
                    key={day}
                    disabled={busy || past || !inMonth}
                    onClick={() => change([day], !blocked)}
                    aria-pressed={blocked}
                    aria-label={`${formatLongDate(day)}${blocked ? ", без онлайн записване" : ""}`}
                    title={bySalon ? "Целият салон е без онлайн записване" : undefined}
                    className={`flex h-11 items-center justify-center rounded-lg text-sm transition ${
                      !inMonth
                        ? "invisible"
                        : blocked
                          ? "bg-red-600 font-bold text-white"
                          : bySalon
                            ? "bg-red-100 text-red-800"
                            : past
                              ? "text-neutral-300"
                              : "hover:bg-neutral-100"
                    } ${day === today && !blocked ? "font-bold ring-1 ring-neutral-400" : ""}`}
                  >
                    {Number(day.slice(8))}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-2 text-xs text-neutral-500">
              Докоснете ден, за да спрете или пуснете онлайн записването.
              {specialist !== null && " Светлочервените дни са спрени за целия салон."}
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
            <p className="text-sm font-semibold">Период (например отпуск)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="От">
                <input
                  type="date"
                  min={today}
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))}
                  className={inputClass}
                />
              </Field>
              <Field label="До">
                <input
                  type="date"
                  min={range.from}
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy || !range.from || !range.to}
                onClick={() => change(period(), true)}
                className="rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Спри за периода
              </button>
              <button
                disabled={busy || !range.from || !range.to}
                onClick={() => change(period(), false)}
                className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Пусни отново
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div>
        <p className="mb-1 text-sm font-semibold">Предстоящи дни без онлайн записване</p>
        {data.blocks.length === 0 ? (
          <p className="text-sm text-neutral-500">Няма.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {data.blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <PhoneOff size={16} className="shrink-0 text-red-600" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{shortDate(b.date)}</span> · {whoLabel(b, data)}
                  <span className="block truncate text-xs text-neutral-500">{b.message || data.default_message}</span>
                </span>
                {manageable(b) && (
                  <button
                    aria-label={`Пусни онлайн записването на ${shortDate(b.date)} (${whoLabel(b, data)})`}
                    disabled={busy}
                    onClick={() => remove(b)}
                    className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * From the calendar: stop or restart online booking on one day, for the whole salon (administrators)
 * or per specialist (each for themselves), with an optional text for that day.
 */
export function OnlineDaySheet({
  date,
  onClose,
  onChanged,
}: {
  date: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<OnlineBlocks | null>(null);
  const [checked, setChecked] = useState<Set<Scope>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    staffApi
      .onlineBlocks(date, date)
      .then((next) => {
        setData(next);
        setChecked(new Set(next.blocks.map((b) => (b.specialist === null ? "" : `${b.specialist}`) as Scope)));
        setMessage(next.blocks.find((b) => b.message)?.message ?? "");
      })
      .catch((e) => setError(errorText(e)));
  }, [date]);

  const rows = useMemo(() => {
    if (!data) return [];
    const blocked = new Set(data.blocks.map((b) => b.specialist));
    return [
      { value: "" as Scope, label: "Целият салон", can: data.can_block_salon, shown: true },
      ...data.specialists.map((s) => ({
        value: `${s.id}` as Scope,
        label: s.name,
        can: s.can_manage,
        // Colleagues you cannot change show only when they are closed, so you know.
        shown: s.can_manage || blocked.has(s.id),
      })),
    ].filter((r) => r.shown);
  }, [data]);

  function toggle(value: Scope) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      for (const row of rows.filter((r) => r.can)) {
        const specialist = toSpecialist(row.value);
        const was = data.blocks.some((b) => b.specialist === specialist);
        const now = checked.has(row.value);
        // Closing an already closed day again saves the new text.
        if (now || was) {
          await staffApi.setOnlineBlocks({ dates: [date], specialist, blocked: now, message: message.trim() });
        }
      }
      onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const canChange = rows.some((r) => r.can);

  return (
    <Sheet
      title="Без онлайн записване"
      onClose={onClose}
      footer={
        canChange ? (
          <button
            onClick={save}
            disabled={busy || !data}
            className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-50"
          >
            Запази
          </button>
        ) : undefined
      }
    >
      <p className="font-semibold text-neutral-900">{formatLongDate(date)}</p>
      <p className="mt-1 text-sm text-neutral-600">
        Отметнатите не могат да бъдат записани онлайн в този ден. Клиентите виждат текста с бутон за обаждане. От
        календара записвате както винаги.
      </p>
      {!data ? (
        error ? null : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-neutral-100" />
        )
      ) : (
        <div className="mt-4 space-y-4">
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {rows.map((row) => (
              <label key={row.value || "salon"} className="flex items-center gap-3 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked.has(row.value)}
                  disabled={!row.can || busy}
                  onChange={() => toggle(row.value)}
                  className="h-5 w-5 accent-red-600"
                />
                <span className={`flex-1 ${row.value === "" ? "font-semibold" : ""}`}>{row.label}</span>
                {!row.can && <span className="text-xs text-neutral-500">само администратор</span>}
              </label>
            ))}
          </div>
          {canChange && (
            <Field label="Текст за клиентите (по желание)">
              <input
                value={message}
                maxLength={255}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={data.default_message}
                className={inputClass}
              />
            </Field>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Sheet>
  );
}
