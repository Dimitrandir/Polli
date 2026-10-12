"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

import type { Profile, ProfileChanges } from "@/lib/account-api";

import { Button } from "../ui/Button";

export type SpecialistOption = { id: number; name: string };

const inputClass =
  "w-full rounded-2xl bg-surface px-4 py-3.5 text-base text-ink ring-1 ring-line outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-accent disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}

export function ProfileForm({
  profile,
  specialists,
  onSave,
}: {
  profile: Profile;
  specialists: SpecialistOption[];
  /** Resolves to an error message, or null when saved. */
  onSave: (changes: ProfileChanges) => Promise<string | null>;
}) {
  const [form, setForm] = useState<ProfileChanges>({
    first_name: profile.first_name,
    last_name: profile.last_name,
    phone: profile.phone,
    preferred_specialist: profile.preferred_specialist,
    reminder_channel: profile.reminder_channel,
    marketing_consent: profile.marketing_consent,
    privacy_consent: profile.privacy_consent,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const text = (field: "first_name" | "last_name" | "phone") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(await onSave(form));
    setSaved(true);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Име *">
          <input required autoComplete="given-name" value={form.first_name ?? ""} onChange={text("first_name")} className={inputClass} />
        </Field>
        <Field label="Фамилия">
          <input autoComplete="family-name" value={form.last_name ?? ""} onChange={text("last_name")} className={inputClass} />
        </Field>
        <Field label="Телефон *">
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0888 123 456"
            value={form.phone ?? ""}
            onChange={text("phone")}
            className={inputClass}
          />
        </Field>
        <Field label="Имейл">
          <input disabled value={profile.email} className={inputClass} />
        </Field>
        <Field label="Любим специалист">
          <select
            value={form.preferred_specialist ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, preferred_specialist: e.target.value ? Number(e.target.value) : null }))}
            className={inputClass}
          >
            <option value="">Без значение</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Напомняния за часа">
          <select
            value={form.reminder_channel}
            onChange={(e) => setForm((f) => ({ ...f, reminder_channel: e.target.value as Profile["reminder_channel"] }))}
            className={inputClass}
          >
            <option value="email">По имейл</option>
            <option value="none">Без напомняния</option>
          </select>
        </Field>
      </div>

      {!profile.complete && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
          <input
            type="checkbox"
            required
            checked={!!form.privacy_consent}
            onChange={(e) => setForm((f) => ({ ...f, privacy_consent: e.target.checked }))}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-ink-soft">
            Съгласен/съгласна съм салонът да съхранява данните ми за резервации и връзка с мен, съгласно{" "}
            <a href="/poveritelnost" className="font-semibold text-ink underline underline-offset-4">
              политиката за поверителност
            </a>
            .
          </span>
        </label>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
        <input
          type="checkbox"
          checked={!!form.marketing_consent}
          onChange={(e) => setForm((f) => ({ ...f, marketing_consent: e.target.checked }))}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-ink-soft">Искам да получавам новини и промоции от салона (по желание, може да се откажете по всяко време).</span>
      </label>

      {error && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {profile.complete ? "Запази промените" : "Създай профила"}
        </Button>
        {saved && !error && !busy && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="size-4" /> Запазено
          </span>
        )}
      </div>
    </form>
  );
}
