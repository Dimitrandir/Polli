"use client";

import { LoaderCircle, Search, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { clockLabel, salonDateTime } from "@/lib/calendar";
import { formatDuration, formatLongDate, formatPrice } from "@/lib/format";
import { staffApi, type DaySpecialist, type NewClient, type StaffClient, type StaffService } from "@/lib/staff-api";

import { Field, inputClass, Sheet } from "./Sheet";

export type NewBookingDraft = { date: string; specialist: number; minutes: number };

const EMPTY_CLIENT: NewClient = { first_name: "", last_name: "", phone: "", email: "" };

export function NewBookingSheet({
  draft,
  specialists,
  services,
  onClose,
  onCreated,
}: {
  draft: NewBookingDraft;
  specialists: DaySpecialist[];
  services: StaffService[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [specialist, setSpecialist] = useState(draft.specialist);
  const [time, setTime] = useState(clockLabel(draft.minutes));
  const [chosen, setChosen] = useState<number[]>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [client, setClient] = useState<StaffClient | null>(null);
  const [newClient, setNewClient] = useState<NewClient | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const duration = selected.reduce((sum, s) => sum + s.duration, 0);
  const [h, m] = time.split(":").map(Number);
  const startMinutes = h * 60 + m;

  const matches = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    return offers.filter(
      (o) => !chosen.includes(o.id) && (!q || o.name.toLowerCase().includes(q) || o.group.toLowerCase().includes(q)),
    );
  }, [offers, chosen, serviceQuery]);

  function changeSpecialist(id: number) {
    setSpecialist(id);
    // Keep only the services the new specialist also does.
    setChosen((ids) => ids.filter((sid) => services.some((s) => s.id === sid && s.specialists.some((o) => o.id === id))));
  }

  async function save() {
    setError(null);
    if (!selected.length) return setError("Изберете поне една услуга.");
    if (!client && !(newClient && newClient.first_name.trim() && newClient.phone.trim())) {
      return setError("Изберете клиент или въведете име и телефон на нов.");
    }
    setSaving(true);
    try {
      await staffApi.createBooking({
        ...(client ? { client: client.id } : { new_client: newClient! }),
        specialist,
        services: selected.map((s) => s.id),
        start: salonDateTime(draft.date, startMinutes),
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
      title="Нов час"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm text-neutral-600">
            {selected.length ? (
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
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--staff)] px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {saving && <LoaderCircle size={18} className="animate-spin" />}
            Запази
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Специалист">
            <select value={specialist} onChange={(e) => changeSpecialist(Number(e.target.value))} className={inputClass}>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Начало">
            <input
              type="time"
              step={300}
              required
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Услуги</span>
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
              className={`${inputClass} pl-9`}
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
                    <span className="block text-xs text-neutral-500">{s.group}</span>
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

        <ClientPicker
          client={client}
          newClient={newClient}
          onClient={(c) => {
            setClient(c);
            setNewClient(null);
          }}
          onNewClient={(c) => {
            setNewClient(c);
            setClient(null);
          }}
        />

        <Field label="Вътрешна бележка">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function ClientPicker({
  client,
  newClient,
  onClient,
  onNewClient,
}: {
  client: StaffClient | null;
  newClient: NewClient | null;
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
            <span className="block text-xs text-neutral-500">{client.phone}</span>
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
          <input placeholder="Име" value={newClient.first_name} onChange={set("first_name")} className={inputClass} />
          <input placeholder="Фамилия" value={newClient.last_name} onChange={set("last_name")} className={inputClass} />
          <input
            placeholder="Телефон"
            type="tel"
            value={newClient.phone}
            onChange={set("phone")}
            className={inputClass}
          />
          <input placeholder="Имейл" type="email" value={newClient.email} onChange={set("email")} className={inputClass} />
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
          className={`${inputClass} pl-9`}
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
                <span className="block text-xs text-neutral-500">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => {
          const digits = query.replace(/[^\d+]/g, "");
          const looksLikePhone = digits.length >= 6;
          onNewClient({ ...EMPTY_CLIENT, ...(looksLikePhone ? { phone: query.trim() } : { first_name: query.trim() }) });
        }}
        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--staff)]"
      >
        <UserPlus size={16} /> Нов клиент
      </button>
    </div>
  );
}
