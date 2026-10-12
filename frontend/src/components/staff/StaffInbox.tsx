"use client";

import clsx from "clsx";
import { ChevronLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { formatLongDate, formatTime, todayKey } from "@/lib/format";
import { staffApi, type Inbox } from "@/lib/staff-api";

import { ClientSheet } from "./ClientSheet";

const REFRESH_MS = 30_000;

function when(iso: string) {
  return todayKey(new Date(iso)) === todayKey() ? formatTime(iso) : formatLongDate(iso);
}

/** Conversations with clients, newest first; unread ones stand out. */
export function StaffInbox() {
  const router = useRouter();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInbox(await staffApi.inbox());
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.replace("/personal/vhod");
        return;
      }
      setError(e instanceof ApiError ? e.message : "Не успях да заредя съобщенията.");
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-[var(--staff)] px-2 text-white shadow">
        <Link href="/personal" aria-label="Към календара" className="p-2">
          <ChevronLeft size={26} />
        </Link>
        <h1 className="text-lg font-bold">Съобщения</h1>
      </header>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {inbox === null ? (
        <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : inbox.conversations.length === 0 ? (
        <p className="flex flex-col items-center gap-2 px-6 py-16 text-center text-neutral-500">
          <MessageCircle size={32} />
          Още няма съобщения от клиенти. Клиентите пишат от профила си на сайта.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {inbox.conversations.map((c) => (
            <li key={c.client.id}>
              <button onClick={() => setOpen(c.client.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50">
                <span className="min-w-0 flex-1">
                  <span className={clsx("block truncate", c.unread > 0 && "font-bold")}>
                    {c.client.name}
                    {c.client.nickname && <span className="font-normal text-neutral-500"> „{c.client.nickname}“</span>}
                  </span>
                  <span className="block truncate text-sm text-neutral-500">
                    {c.last_message.from_client ? "" : "Вие: "}
                    {c.last_message.text}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-neutral-500">{when(c.last_message.created_at)}</span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-[var(--staff)] px-2 text-xs font-semibold text-white">{c.unread}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open !== null && (
        <ClientSheet
          clientId={open}
          initialTab="messages"
          onClose={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
