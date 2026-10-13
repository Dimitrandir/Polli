"use client";

import { CalendarDays, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { staffApi } from "@/lib/staff-api";

import { Field, inputClass } from "./Sheet";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sets the CSRF cookie and skips the form when already logged in.
  useEffect(() => {
    staffApi
      .session()
      .then((s) => s.authenticated && router.replace("/personal"))
      .catch(() => null);
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffApi.login(username.trim(), password);
      router.replace("/personal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Нещо се обърка. Опитайте отново.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-white text-neutral-900">
      <div className="flex h-14 items-center gap-2 bg-[var(--staff)] px-4 text-white">
        <CalendarDays size={24} />
        <span className="text-lg font-bold">SIS Esthetics · Персонал</span>
      </div>
      <form onSubmit={submit} className="mx-auto mt-12 w-full max-w-sm space-y-4 px-5">
        <h1 className="text-2xl font-bold">Вход</h1>
        <Field label="Потребителско име">
          <input
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Парола">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy && <LoaderCircle size={18} className="animate-spin" />}
          Влез
        </button>
        <p className="text-sm text-neutral-500">
          Профилите се създават от администратора в админ панела (Потребители → „Статут на персонал“).
        </p>
      </form>
    </main>
  );
}
