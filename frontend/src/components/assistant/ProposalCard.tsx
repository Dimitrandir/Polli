"use client";

import { CalendarCheck, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ClientDetails } from "@/lib/api";
import { assistantApi, type Proposal } from "@/lib/assistant-api";
import { formatLongDate, formatPrice, formatTime } from "@/lib/format";

import { manageHref } from "../booking/DoneStep";

/** A time the assistant offered: the visitor checks it, adds name and phone and confirms. */
export function ProposalCard({
  proposal,
  initialClient,
  consentGiven,
  onConfirmed,
}: {
  proposal: Proposal;
  initialClient: ClientDetails;
  /** The logged-in client already accepted the privacy policy. */
  consentGiven: boolean;
  onConfirmed: (proposal: Proposal) => void;
}) {
  const [client, setClient] = useState(initialClient);
  const [consent, setConsent] = useState(consentGiven);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof ClientDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setClient((c) => ({ ...c, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      onConfirmed(await assistantApi.confirm(proposal.id, client, consent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Нещо се обърка.");
    } finally {
      setSaving(false);
    }
  }

  const booked = proposal.booking;
  return (
    <article
      aria-label="Предложен час"
      className="w-full rounded-2xl bg-surface p-4 text-sm text-ink ring-1 ring-accent/40 shadow-[0_14px_30px_-20px_var(--accent)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          {booked ? <Check className="size-5" /> : <CalendarCheck className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{formatLongDate(proposal.start)}</p>
          <p className="text-ink-soft">
            {formatTime(proposal.start)} – {proposal.end}
          </p>
        </div>
        <p className="font-semibold whitespace-nowrap">{formatPrice(proposal.total_price)}</p>
      </div>
      <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
        {proposal.items.map((item, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>
              {item.service} <span className="text-ink-soft">· {item.specialist}</span>
            </span>
            <span className="whitespace-nowrap text-ink-soft">{item.start}</span>
          </li>
        ))}
      </ul>

      {booked ? (
        <div className="mt-3 rounded-xl bg-success/10 px-3 py-2.5 text-success">
          <p className="font-semibold">Часът е запазен. Очакваме ви!</p>
          <Link href={manageHref(booked)} className="mt-1 inline-block font-semibold underline underline-offset-4">
            Виж или откажи резервацията
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Име" required value={client.first_name} onChange={set("first_name")} autoComplete="given-name" />
            <Input label="Фамилия" value={client.last_name} onChange={set("last_name")} autoComplete="family-name" />
          </div>
          <Input label="Телефон" required type="tel" value={client.phone} onChange={set("phone")} autoComplete="tel" />
          <Input label="Имейл (по желание)" type="email" value={client.email} onChange={set("email")} autoComplete="email" />
          {!consentGiven && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                Съгласен/на съм с{" "}
                <a href="/poveritelnost" target="_blank" className="font-semibold text-ink underline underline-offset-2">
                  политиката за поверителност
                </a>
                .
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !consent || !client.first_name.trim() || !client.phone.trim()}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-semibold text-bg transition hover:bg-accent hover:text-accent-ink disabled:bg-line disabled:text-ink-soft"
          >
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Потвърди часа
          </button>
        </form>
      )}
    </article>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
      {label}
      <input
        {...props}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-base font-normal text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
