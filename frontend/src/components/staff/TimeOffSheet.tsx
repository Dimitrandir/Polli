"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { clockLabel, minutesInDay } from "@/lib/calendar";
import { formatLongDate } from "@/lib/format";
import { staffApi, type TimeOff } from "@/lib/staff-api";

import { Sheet } from "./Sheet";

export function TimeOffSheet({
  timeOff,
  date,
  specialistName,
  onClose,
  onChanged,
}: {
  timeOff: TimeOff;
  date: string;
  specialistName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = clockLabel(minutesInDay(timeOff.start, date));
  const to = clockLabel(Math.min(minutesInDay(timeOff.end, date), 24 * 60 - 1));

  async function remove() {
    if (!window.confirm("Да премахна ли блокираното време? Ако е за няколко дни, се маха изцяло.")) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi.deleteTimeOff(timeOff.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Блокирано време"
      onClose={onClose}
      footer={
        <button
          onClick={remove}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          <Trash2 size={18} /> Премахни
        </button>
      }
    >
      <p className="text-xl font-semibold text-neutral-900">{timeOff.reason || "Блокирано"}</p>
      <p className="mt-1 text-neutral-600">
        {specialistName} · {formatLongDate(date)} · {from} – {to}
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Sheet>
  );
}
