"use client";

import clsx from "clsx";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";

const HINTS: Partial<Record<PushState, string>> = {
  "ios-home-screen":
    "За известия на iPhone: натиснете „Сподели“ → „Добави към началния екран“ и отворете сайта от иконата.",
  denied: "Известията за сайта са спрени в настройките на браузъра. Разрешете ги оттам и презаредете страницата.",
  unsupported: "Този браузър не поддържа известия. Опитайте с Chrome, Safari или Firefox.",
};

/** "Notifications on this phone" switch for the messages page. `staff` matches the team's plainer look. */
export function PushToggle({ variant = "site" }: { variant?: "site" | "staff" }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("off-server"));
  }, []);

  if (state === "loading" || state === "off-server") return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Известията не се включиха. Опитайте отново.");
    } finally {
      setBusy(false);
    }
  }

  const staff = variant === "staff";
  const hint = HINTS[state];
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-3 text-sm",
        staff ? "border-b border-neutral-100 bg-neutral-50 px-4 py-3 text-neutral-700" : "mb-6 rounded-2xl bg-surface px-4 py-3 text-ink-soft ring-1 ring-line",
      )}
    >
      {state === "on" ? <Bell className="size-4 shrink-0" /> : <BellOff className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        {hint ?? (state === "on" ? "Известията на това устройство са включени." : "Получавайте известие на телефона при ново съобщение.")}
        {error && <span role="alert" className={clsx("block", staff ? "text-red-700" : "text-danger")}>{error}</span>}
      </span>
      {(state === "on" || state === "off") && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={clsx(
            "shrink-0 rounded-full px-4 py-2 font-semibold transition disabled:opacity-60",
            state === "on"
              ? staff
                ? "text-neutral-600 hover:bg-neutral-100"
                : "text-ink-soft hover:bg-surface-2 hover:text-ink"
              : staff
                ? "bg-[var(--staff)] text-white"
                : "bg-ink text-bg hover:bg-accent hover:text-accent-ink",
          )}
        >
          {busy ? "…" : state === "on" ? "Изключи" : "Включи известия"}
        </button>
      )}
    </div>
  );
}
