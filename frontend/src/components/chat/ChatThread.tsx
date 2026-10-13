"use client";

import clsx from "clsx";
import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Message } from "@/lib/account-api";
import { formatLongDate, formatTime } from "@/lib/format";

/**
 * A conversation between a client and the salon. `side` says whose screen it is:
 * that side's messages are on the right.
 */
export function ChatThread({
  messages,
  side,
  onSend,
  disabled,
  placeholder = "Напишете съобщение…",
  ownBubble = "bg-ink text-bg",
  otherBubble = "bg-surface text-ink ring-1 ring-line",
  meta = "text-ink-soft",
}: {
  messages: Message[];
  side: "client" | "salon";
  /** Resolves to true when the message was sent (the box is then cleared). */
  onSend: (text: string) => Promise<boolean>;
  disabled?: string | null;
  placeholder?: string;
  ownBubble?: string;
  otherBubble?: string;
  meta?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      if (await onSend(value)) setText("");
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Съобщения" className="flex flex-col gap-2">
        {messages.length === 0 && <li className={clsx("py-6 text-center text-sm", meta)}>Още няма съобщения.</li>}
        {messages.map((m) => {
          const own = (side === "client") === m.from_client;
          const day = formatLongDate(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <li key={m.id} className="flex flex-col">
              {showDay && <p className={clsx("my-2 text-center text-xs", meta)}>{day}</p>}
              <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5", own ? `self-end ${ownBubble}` : `self-start ${otherBubble}`)}>
                {!own && <p className="mb-0.5 text-xs font-semibold opacity-75">{m.sender_name}</p>}
                <p className="whitespace-pre-line break-words">{m.text}</p>
              </div>
              <p className={clsx("mt-0.5 text-[11px]", meta, own ? "self-end" : "self-start")}>
                {formatTime(m.created_at)}
                {own && m.read_at && " · прочетено"}
              </p>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      {disabled ? (
        <p className={clsx("rounded-xl px-3 py-2 text-sm", meta)}>{disabled}</p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            aria-label="Съобщение"
            rows={2}
            maxLength={2000}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-h-12 flex-1 resize-none rounded-2xl border border-current/15 bg-transparent px-4 py-3 text-base outline-none focus:border-current/40"
          />
          <button
            type="submit"
            aria-label="Изпрати"
            disabled={sending || !text.trim()}
            className={clsx("grid size-12 shrink-0 place-items-center rounded-full disabled:opacity-40", ownBubble)}
          >
            {sending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
          </button>
        </form>
      )}
    </div>
  );
}
