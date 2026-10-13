"use client";

import { Ban, Check, Globe, Mail, Phone, RotateCcw, UserX } from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { formatLongDate, formatPrice, formatTime } from "@/lib/format";
import { staffApi, type StaffSpecialist, type StaffBooking } from "@/lib/staff-api";

import { Field, inputClass, Sheet } from "./Sheet";

const STATUS_LABEL: Record<StaffBooking["status"], string> = {
  confirmed: "Потвърдена",
  completed: "Изпълнена",
  no_show: "Неявяване",
  cancelled: "Отказана",
};

export function BookingSheet({
  booking,
  specialists,
  onClose,
  onChanged,
}: {
  booking: StaffBooking;
  specialists: StaffSpecialist[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(booking.internal_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(specialists.map((s) => [s.id, s.name]));
  const phone = booking.client.phone;

  async function run(action: () => Promise<unknown>, close = true) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      if (close) onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    const reason = window.prompt("Да откажа ли часа? Причина (по желание):", "");
    if (reason === null) return;
    void run(() => staffApi.cancelBooking(booking.id, reason));
  }

  const active = booking.status === "confirmed";

  return (
    <Sheet
      title={`${formatTime(booking.start)} – ${formatTime(booking.end)}`}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-3 gap-2">
          {active ? (
            <>
              <ActionButton
                icon={<Check size={18} />}
                label="Изпълнена"
                tone="success"
                disabled={busy}
                onClick={() => run(() => staffApi.updateBooking(booking.id, { status: "completed" }))}
              />
              <ActionButton
                icon={<UserX size={18} />}
                label="Неявяване"
                tone="warning"
                disabled={busy}
                onClick={() => run(() => staffApi.updateBooking(booking.id, { status: "no_show" }))}
              />
              <ActionButton icon={<Ban size={18} />} label="Откажи" tone="danger" disabled={busy} onClick={cancel} />
            </>
          ) : (
            <div className="col-span-3">
              <ActionButton
                icon={<RotateCcw size={18} />}
                label="Върни като потвърдена"
                tone="neutral"
                disabled={busy}
                onClick={() => run(() => staffApi.updateBooking(booking.id, { status: "confirmed" }))}
              />
            </div>
          )}
        </div>
      }
    >
      <p className="text-sm text-neutral-500">
        {formatLongDate(booking.start)} · {STATUS_LABEL[booking.status]}
        {booking.source === "online" && (
          <span className="ml-2 inline-flex items-center gap-1 text-[var(--staff)]">
            <Globe size={14} /> онлайн
          </span>
        )}
      </p>

      <div className="mt-3">
        <p className="text-xl font-semibold text-neutral-900">
          {booking.client.name}
          {booking.client.is_blocked && <span className="ml-2 text-sm text-red-600">⛔ блокиран</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--staff)] px-4 py-2 text-sm font-semibold text-white"
          >
            <Phone size={16} /> {phone}
          </a>
          {booking.client.email && (
            <a
              href={`mailto:${booking.client.email}`}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
            >
              <Mail size={16} /> {booking.client.email}
            </a>
          )}
        </div>
        {booking.client.notes && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{booking.client.notes}</p>
        )}
      </div>

      <ul className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {booking.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div>
              <p className="font-medium text-neutral-900">{item.service_name}</p>
              <p className="text-sm text-neutral-500">
                {formatTime(item.start)} – {formatTime(item.end)} · {names.get(item.specialist) ?? "—"}
              </p>
            </div>
            <span className="shrink-0 text-sm text-neutral-700">{formatPrice(item.price)}</span>
          </li>
        ))}
        <li className="flex justify-between px-3 py-2.5 font-semibold text-neutral-900">
          <span>Общо</span>
          <span>{formatPrice(booking.total_price)}</span>
        </li>
      </ul>

      {booking.note && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Бележка от клиента</p>
          <p className="mt-1 whitespace-pre-line text-neutral-800">{booking.note}</p>
        </div>
      )}

      <div className="mt-4">
        <Field label="Вътрешна бележка">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
        {note !== booking.internal_note && (
          <button
            disabled={busy}
            onClick={() => run(() => staffApi.updateBooking(booking.id, { internal_note: note }), false)}
            className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Запази бележката
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Sheet>
  );
}

const TONES = {
  success: "bg-green-600 text-white",
  warning: "bg-amber-500 text-white",
  danger: "bg-red-600 text-white",
  neutral: "bg-neutral-800 text-white",
};

function ActionButton({
  icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof TONES;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-sm font-semibold disabled:opacity-50 ${TONES[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}
