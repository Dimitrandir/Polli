"use client";

import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { accountApi } from "@/lib/account-api";
import { api, ApiError, type Booking, type ClientDetails } from "@/lib/api";
import { type BookingState, itemRequests } from "@/lib/booking-state";

import { Button } from "../ui/Button";
import { StepHeading } from "./StepHeading";

const STORAGE_KEY = "sis-client-details";
const EMPTY: ClientDetails = { first_name: "", last_name: "", phone: "", email: "" };

function loadSaved(): ClientDetails {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(details: ClientDetails) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // Private mode or blocked storage: remembering details is only a convenience.
  }
}

export function DetailsStep({
  state,
  onBooked,
  onSlotTaken,
}: {
  state: BookingState;
  onBooked: (booking: Booking) => void;
  onSlotTaken: (message: string) => void;
}) {
  const [client, setClient] = useState<ClientDetails>(EMPTY);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClient(loadSaved());
    // A logged-in client's own profile wins over details remembered in this browser.
    accountApi
      .session()
      .then((s) => (s.user?.has_profile ? accountApi.profile() : null))
      .then((p) => p && setClient({ first_name: p.first_name, last_name: p.last_name, phone: p.phone, email: p.email }))
      .catch(() => null);
  }, []);

  const set = (field: keyof ClientDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setClient((c) => ({ ...c, [field]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        start: state.slot.start,
        parallel: state.parallel,
        items: itemRequests(state),
        note,
        client,
        consent,
      });
      save(client);
      onBooked(booking);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Нещо се обърка. Опитайте отново.";
      if (message.includes("не е свободен")) onSlotTaken(message);
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <StepHeading eyebrow="Стъпка 4" title="Вашите данни" hint="Ще ви изпратим потвърждение. Плащането е на място в салона." />

      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Име" required value={client.first_name} onChange={set("first_name")} autoComplete="given-name" />
          <Field label="Фамилия" value={client.last_name} onChange={set("last_name")} autoComplete="family-name" />
          <Field
            label="Телефон"
            required
            type="tel"
            inputMode="tel"
            placeholder="0888 123 456"
            pattern="[0-9+\s\(\)\-]{6,}"
            title="Въведете телефонен номер"
            value={client.phone}
            onChange={set("phone")}
            autoComplete="tel"
          />
          <Field
            label="Имейл"
            type="email"
            placeholder="за потвърждение"
            value={client.email}
            onChange={set("email")}
            autoComplete="email"
          />
        </div>

        <TextArea label="Бележка към резервацията" value={note} onChange={(e) => setNote(e.target.value)} />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-ink-soft">
            Съгласен/съгласна съм данните ми да бъдат използвани за управление на резервацията, съгласно{" "}
            <a href="/poveritelnost" className="font-semibold text-ink underline underline-offset-4">
              политиката за поверителност
            </a>
            .
          </span>
        </label>

        <p className="text-xs text-ink-soft">
          Безплатен отказ онлайн до 24 часа преди часа. След това – само по телефона.
        </p>

        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting || !state.slot} className="w-full sm:w-auto">
          {submitting && <LoaderCircle className="size-4 animate-spin" />}
          {submitting ? "Запазваме..." : "Потвърди резервацията"}
        </Button>
      </form>
    </section>
  );
}

const inputClass =
  "mt-2 w-full rounded-2xl bg-surface px-4 py-3.5 text-ink ring-1 ring-line outline-none transition placeholder:text-ink-soft/60 focus:ring-2 focus:ring-accent";

function Field({ label, required, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      <input id={id} required={required} className={inputClass} {...props} />
    </div>
  );
}

function TextArea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label} <span className="font-normal text-ink-soft">(по желание)</span>
      </label>
      <textarea id={id} rows={3} maxLength={1000} className={clsx(inputClass, "resize-none")} {...props} />
    </div>
  );
}
