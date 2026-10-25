"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { accountApi, type Message } from "@/lib/account-api";
import { ApiError } from "@/lib/api";
import { usePolling } from "@/lib/use-polling";

import { ChatThread } from "../chat/ChatThread";
import { PushToggle } from "../push/PushToggle";
import { Skeleton } from "../ui/Skeleton";

// New messages from the salon show up without reloading the page.
const REFRESH_MS = 5_000;

export function ClientMessages() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => accountApi.messages().then(setMessages), []);

  useEffect(() => {
    accountApi
      .session()
      .then((session) => {
        if (!session.authenticated) {
          router.replace("/vhod?next=/profil/saobshtenia");
          return;
        }
        setHasProfile(!!session.user?.has_profile);
        return load();
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново."));
  }, [router, load]);

  usePolling(load, REFRESH_MS, messages !== null);

  async function send(text: string) {
    setError(null);
    try {
      const message = await accountApi.sendMessage(text);
      setMessages((list) => [...(list ?? []), message]);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Съобщението не беше изпратено. Опитайте отново.");
      return false;
    }
  }

  return (
    <div>
      <Link href="/profil" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Профил
      </Link>
      <h1 className="mt-4 mb-2 font-display text-5xl font-semibold text-ink">Съобщения</h1>
      <p className="mb-8 text-ink-soft">Пишете ни директно. Отговаря фризьорът ви или някой от екипа.</p>
      {messages !== null && <PushToggle />}

      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {messages === null && !error ? (
        <Skeleton className="h-64" />
      ) : (
        <ChatThread
          messages={messages ?? []}
          side="client"
          onSend={send}
          disabled={hasProfile ? null : "Попълнете профила си (име и телефон), за да ни пишете."}
          ownBubble="bg-ink text-bg"
          otherBubble="bg-surface text-ink ring-1 ring-line"
          meta="text-ink-soft"
        />
      )}
    </div>
  );
}
