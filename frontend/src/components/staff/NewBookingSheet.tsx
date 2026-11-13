"use client";

import { LoaderCircle, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { clockLabel, salonDateTime } from "@/lib/calendar";
import { formatDuration, formatLongDate, formatPrice } from "@/lib/format";
import { staffApi, type StaffSpecialist, type NewClient, type StaffClient, type StaffService } from "@/lib/staff-api";

import { Field, inputClass, Sheet } from "./Sheet";
import { TimeField } from "./TimeField";

export type NewBookingDraft = { date: string; specialist: number; minutes: number; client?: StaffClient | null };

/** Quick choices for how long the visit takes, in minutes. */
export const DURATION_CHOICES = [30, 45, 60, 90, 120, 150, 180];
const DURATION_STEP = 15;
const MAX_DURATION = 12 * 60;

const EMPTY_CLIENT: NewClient = { first_name: "", last_name: "", phone: "", email: "" };

/** What is still missing before the booking can be saved; shown next to the field and above "Запази". */
type Missing = "services" | "client" | "first_name" | "phone";

const invalidClass = "border-red-500 ring-2 ring-red-500/30";

export function NewBookingSheet({
  draft,
  specialists,
  services,
  onClose,
  onCreated,
}: {
  draft: NewBookingDraft;
  specialists: StaffSpecialist[];
  services: StaffService[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [specialist, setSpecialist] = useState(draft.specialist);
  const [time, setTime] = useState(clockLabel(draft.minutes));
  const [chosen, setChosen] = useState<number[]>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [client, setClient] = useState<StaffClient | null>(draft.client ?? null);
  const [newClient, setNewClient] = useState<NewClient | null>(null);
  // The client's latest services, newest first; shown at the top of the list.
  const [recent, setRecent] = useState<number[]>([]);
  const [note, setNote] = useState("");
  // How long the whole visit takes when staff set it themselves; null = the services' usual time.
  const [customDuration, setCustomDuration] = useState<number | null>(null);
  const [kind, setKind] = useState<"booking" | "block">("booking");
  const [blockEnd, setBlockEnd] = useState(clockLabel(Math.min(draft.minutes + 60, 24 * 60 - 1)));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Missing[]>([]);

  // Services this specialist does, with their own price and duration.
  const offers = useMemo(
    () =>
      services.flatMap((s) => {
        const offer = s.specialists.find((o) => o.id === specialist);
        return offer ? [{ ...s, price: offer.price, duration: offer.duration_minutes }] : [];
      }),
    [services, specialist],
  );
  const selected = chosen.flatMap((id) => offers.filter((o) => o.id === id));
  const total = selected.reduce((sum, s) => sum + Number(s.price), 0);
  const usualDuration = selected.reduce((sum, s) => sum + s.duration, 0);
  const duration = customDuration ?? usualDuration;
  const changeDuration = (minutes: number) => {
    const next = Math.min(Math.max(minutes, 5 * Math.max(selected.length, 1)), MAX_DURATION);
    setCustomDuration(next === usualDuration ? null : next);
  };
  const [h, m] = time.split(":").map(Number);
  const startMinutes = h * 60 + m;

  const clientId = client?.id;
  useEffect(() => {
    setRecent([]);
    if (!clientId) return;
    let stale = false;
    staffApi
      .recentServices(clientId)
      .then((rows) => !stale && setRecent(rows.map((r) => r.service)))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [clientId]);

  const matches = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    const rank = (id: number) => (recent.includes(id) ? recent.indexOf(id) : recent.length);
    return offers
      .filter(
        (o) => !chosen.includes(o.id) && (!q || o.name.toLowerCase().includes(q) || o.group.toLowerCase().includes(q)),
      )
      .sort((a, b) => rank(a.id) - rank(b.id));
  }, [offers, chosen, serviceQuery, recent]);

  function changeSpecialist(id: number) {
    setSpecialist(id);
    // Keep only the services the new specialist also does.
    setChosen((ids) =>
      ids.filter((sid) => services.some((s) => s.id === sid && s.specialists.some((o) => o.id === id))),
    );
  }

  async function saveBlock() {
    setError(null);
    const [eh, em] = blockEnd.split(":").map(Number);
    const endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) return setError("Краят трябва да е след началото.");
    setSaving(true);
    try {
      await staffApi.createTimeOff({
        specialist,
        start: salonDateTime(draft.date, startMinutes),
        end: salonDateTime(draft.date, endMinutes),
        reason: reason.trim(),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (kind === "block") return saveBlock();
    setError(null);
    const lacking: Missing[] = [];
    if (!client && !newClient) lacking.push("client");
    if (!client && newClient && !newClient.first_name.trim()) lacking.push("first_name");
    if (!client && newClient && !newClient.phone.trim()) lacking.push("phone");
    if (!selected.length) lacking.push("services");
    setMissing(lacking);
    if (lacking.length) {
      const words = {
        client: "клиент",
        first_name: "име на клиента",
        phone: "телефон на новия клиент",
        services: "поне една услуга",
      };
      return setError(`Не мога да запазя: липсва ${lacking.map((f) => words[f]).join(", ")}.`);
    }
    setSaving(true);
    try {
      await staffApi.createBooking({
        ...(client ? { client: client.id } : { new_client: newClient! }),
        specialist,
        services: selected.map((s) => s.id),
        start: salonDateTime(draft.date, startMinutes),
        ...(customDuration !== null && { duration_minutes: customDuration }),
        internal_note: note,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={kind === "block" ? "Блокирай време" : "Нов час"}
      onClose={onClose}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-neutral-600">
              {kind === "block" ? (
                `${time} – ${blockEnd}`
              ) : selected.length ? (
                <>
                  {time} – {clockLabel(Math.min(startMinutes + duration, 24 * 60 - 1))} · {formatDuration(duration)} ·{" "}
                  <span className="font-semibold text-neutral-900">{formatPrice(total)}</span>
                </>
              ) : (
                formatLongDate(draft.date)
              )}
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex touch-manipulation items-center gap-2 rounded-xl bg-[var(--staff)] px-6 py-3 font-semibold text-white shadow-md transition duration-100 select-none hover:brightness-110 active:translate-y-0.5 active:scale-95 active:shadow-none active:brightness-90 disabled:cursor-wait disabled:opacity-70"
            >
              {saving && <LoaderCircle size={18} className="animate-spin" />}
              {saving ? "Запазвам…" : "Запази"}
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div role="tablist" className="grid grid-cols-2 rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
          {(
            [
              ["booking", "Час"],
              ["block", "Блокирай време"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={kind === value}
              onClick={() => {
                setKind(value);
                setError(null);
              }}
              className={`rounded-lg py-2 ${kind === value ? "bg-white text-neutral-900 shadow" : "text-neutral-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Специалист">
            <select
              value={specialist}
              onChange={(e) => changeSpecialist(Number(e.target.value))}
              className={inputClass}
            >
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Начало">
            <TimeField title="Начало" value={time} onChange={setTime} />
          </Field>
        </div>

        {kind === "block" ? (
          <>
            <Field label="До">
              <TimeField title="До" value={blockEnd} onChange={setBlockEnd} />
            </Field>
            <Field label="Причина">
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {["Почивка", "Обедна почивка", "Лично", "Обучение"].map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <ClientPicker
              client={client}
              newClient={newClient}
              missing={missing}
              onClient={(c) => {
                setClient(c);
                setNewClient(null);
                setMissing([]);
              }}
              onNewClient={(c) => {
                setNewClient(c);
                setClient(null);
                setMissing((m) =>
                  m.filter((f) =>
                    f === "first_name" ? !c?.first_name.trim() : f === "phone" ? !c?.phone.trim() : f !== "client",
                  ),
                );
              }}
            />

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Услуги</span>
              {missing.includes("services") && !selected.length && (
                <p className="mb-1 text-sm text-red-600">Изберете поне една услуга.</p>
              )}
              {selected.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {selected.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-lg bg-[var(--staff)]/10 px-3 py-2">
                      <span className="flex-1 text-sm font-medium text-neutral-900">{s.name}</span>
                      <span className="text-xs text-neutral-500">
                        {formatDuration(s.duration)} · {formatPrice(s.price)}
                      </span>
                      <button
                        aria-label={`Махни ${s.name}`}
                        onClick={() => setChosen((ids) => ids.filter((id) => id !== s.id))}
                        className="p-1 text-neutral-500"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-400" />
                <input
                  value={serviceQuery}
                  onChange={(e) => setServiceQuery(e.target.value)}
                  placeholder="Търси услуга…"
                  className={`${inputClass} pl-9 ${missing.includes("services") && !selected.length ? invalidClass : ""}`}
                />
              </div>
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => {
                        setChosen((ids) => [...ids, s.id]);
                        setServiceQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-50"
                    >
                      <span>
                        <span className="block text-sm text-neutral-900">{s.name}</span>
                        <span className="block text-xs text-neutral-500">
                          {recent.includes(s.id) && (
                            <span className="mr-1.5 rounded bg-[var(--staff)]/10 px-1.5 py-0.5 font-semibold text-[var(--staff)]">
                              Последно
                            </span>
                          )}
                          {s.group}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {formatDuration(s.duration)} · {formatPrice(s.price)}
                      </span>
                    </button>
                  </li>
                ))}
                {!matches.length && <li className="px-3 py-2 text-sm text-neutral-500">Няма други услуги.</li>}
              </ul>
            </div>

            {selected.length > 0 && (
              <DurationPicker
                value={duration}
                usual={usualDuration}
                min={5 * selected.length}
                onChange={changeDuration}
              />
            )}

            <Field label="Вътрешна бележка">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  );
}

function DurationPicker({
  value,
  usual,
  min,
  onChange,
}: {
  value: number;
  usual: number;
  min: number;
  onChange: (minutes: number) => void;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${
      active
        ? "border-[var(--staff)] bg-[var(--staff)] font-semibold text-white"
        : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
    }`;
  return (
    <div role="group" aria-label="Продължителност">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Продължителност</span>
        {value !== usual && (
          <button onClick={() => onChange(usual)} className="text-sm text-[var(--staff)]">
            Обичайно: {formatDuration(usual)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="15 минути по-малко"
          disabled={value - DURATION_STEP < min}
          onClick={() => onChange(value - DURATION_STEP)}
          className="rounded-full border border-neutral-300 p-2 text-neutral-700 disabled:opacity-40"
        >
          <Minus size={16} />
        </button>
        <span aria-live="polite" className="min-w-24 text-center font-semibold text-neutral-900">
          {formatDuration(value)}
        </span>
        <button
          aria-label="15 минути повече"
          disabled={value + DURATION_STEP > MAX_DURATION}
          onClick={() => onChange(value + DURATION_STEP)}
          className="rounded-full border border-neutral-300 p-2 text-neutral-700 disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {DURATION_CHOICES.filter((m) => m >= min).map((m) => (
          <button key={m} aria-pressed={value === m} onClick={() => onChange(m)} className={chip(value === m)}>
            {formatDuration(m)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClientPicker({
  client,
  newClient,
  missing,
  onClient,
  onNewClient,
}: {
  client: StaffClient | null;
  newClient: NewClient | null;
  missing: Missing[];
  onClient: (c: StaffClient | null) => void;
  onNewClient: (c: NewClient | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffClient[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      staffApi
        .clients(q)
        .then((rows) => !stale && setResults(rows))
        .catch(() => !stale && setResults([]));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (client) {
    return (
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Клиент</span>
        <div className="flex items-center gap-2 rounded-lg bg-[var(--staff)]/10 px-3 py-2">
          <span className="flex-1">
            <span className="block text-sm font-medium text-neutral-900">
              {client.name} {client.is_blocked && "⛔"}
            </span>
            <span className="block text-xs text-neutral-500">{client.phone || client.email}</span>
          </span>
          <button aria-label="Смени клиента" onClick={() => onClient(null)} className="p-1 text-neutral-500">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (newClient) {
    const set = (field: keyof NewClient) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onNewClient({ ...newClient, [field]: e.target.value });
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Нов клиент</span>
          <button onClick={() => onNewClient(null)} className="text-sm text-[var(--staff)]">
            Търси съществуващ
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Име"
            aria-label="Име"
            aria-invalid={missing.includes("first_name")}
            value={newClient.first_name}
            onChange={set("first_name")}
            className={`${inputClass} ${missing.includes("first_name") ? invalidClass : ""}`}
          />
          <input placeholder="Фамилия" value={newClient.last_name} onChange={set("last_name")} className={inputClass} />
          <input
            placeholder="Телефон *"
            aria-label="Телефон"
            aria-invalid={missing.includes("phone")}
            type="tel"
            value={newClient.phone}
            onChange={set("phone")}
            className={`${inputClass} ${missing.includes("phone") ? invalidClass : ""}`}
          />
          <input
            placeholder="Имейл"
            type="email"
            value={newClient.email}
            onChange={set("email")}
            className={inputClass}
          />
          {(missing.includes("first_name") || missing.includes("phone")) && (
            <p className="col-span-2 text-sm text-red-600">
              {missing.includes("phone")
                ? "Нужен е телефон: по него разпознаваме клиента следващия път."
                : "Нужно е име на клиента."}
            </p>
          )}
          <p className="col-span-2 text-xs text-neutral-500">
            Име и телефон са задължителни. С имейла клиентът вижда часовете си в профила на сайта.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Клиент</span>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Име или телефон…"
          className={`${inputClass} pl-9 ${missing.includes("client") ? invalidClass : ""}`}
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200">
          {results.map((c) => (
            <li key={c.id}>
              <button onClick={() => onClient(c)} className="w-full px-3 py-2 text-left hover:bg-neutral-50">
                <span className="block text-sm text-neutral-900">
                  {c.nickname && <span className="text-neutral-500">{c.nickname} → </span>}
                  {c.name} {c.is_blocked && "⛔"}
                </span>
                <span className="block text-xs text-neutral-500">{c.phone || c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => {
          const digits = query.replace(/[^\d+]/g, "");
          const looksLikePhone = digits.length >= 6;
          onNewClient({
            ...EMPTY_CLIENT,
            ...(looksLikePhone ? { phone: query.trim() } : { first_name: query.trim() }),
          });
        }}
        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--staff)]"
      >
        <UserPlus size={16} /> Нов клиент
      </button>
    </div>
  );
}
