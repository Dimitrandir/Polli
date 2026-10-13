"use client";

import { LoaderCircle, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { accountApi, type AccountSession } from "@/lib/account-api";
import { ApiError } from "@/lib/api";

import { Button } from "../ui/Button";
import { GoogleButton } from "./GoogleButton";

const inputClass =
  "w-full rounded-2xl bg-surface px-4 py-3.5 text-base text-ink ring-1 ring-line outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-accent";

/** Only paths on this site, so a crafted link cannot send the client elsewhere after login. */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/profil";
}

export function LoginPanel({ next }: { next?: string }) {
  const router = useRouter();
  const [googleClientId, setGoogleClientId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Sets the CSRF cookie and skips the form when already logged in.
  useEffect(() => {
    accountApi
      .session()
      .then((s) => (s.authenticated ? router.replace(safeNext(next)) : setGoogleClientId(s.google_client_id)))
      .catch(() => null);
  }, [router, next]);

  function done(session: AccountSession) {
    router.replace(session.user?.has_profile ? safeNext(next) : "/profil");
    router.refresh();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setBusy(false);
    }
  }

  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      const { detail } = await accountApi.requestCode(email.trim());
      setInfo(detail);
      setCodeSent(true);
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => done(await accountApi.verifyCode(email.trim(), code.trim())));
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Профил</p>
      <h1 className="mt-2 font-display text-5xl font-semibold text-ink">Вход</h1>
      <p className="mt-3 text-ink-soft">
        С профил виждате историята на посещенията си, пишете ни директно и записвате час по-бързо. Без пароли.
      </p>

      <div className="mt-8 space-y-6 rounded-[2rem] bg-surface/60 p-6 ring-1 ring-line sm:p-8">
        {googleClientId && (
          <>
            <GoogleButton
              clientId={googleClientId}
              onCredential={(credential) => void run(async () => done(await accountApi.google(credential)))}
            />
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-ink-soft">
              <span className="h-px flex-1 bg-line" /> или <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        {!codeSent ? (
          <form onSubmit={sendCode} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Имейл</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Изпрати ми код
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            {info && <p className="text-sm text-ink-soft">{info}</p>}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Код от писмото</span>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
              />
            </label>
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Влез
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-ink-soft underline" onClick={() => setCodeSent(false)}>
                Друг имейл
              </button>
              <button type="button" className="text-ink-soft underline" disabled={busy} onClick={() => sendCode()}>
                Изпрати нов код
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        С влизането приемате{" "}
        <a href="/poveritelnost" className="underline underline-offset-4">
          политиката за поверителност
        </a>
        . Профилът се създава автоматично при първия вход.
      </p>
    </div>
  );
}
