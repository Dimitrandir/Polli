"use client";

import clsx from "clsx";
import { LoaderCircle, MessageCircleHeart, RotateCcw, SendHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { accountApi } from "@/lib/account-api";
import { ApiError, type ClientDetails } from "@/lib/api";
import { assistantApi, type ChatMessage, type Proposal } from "@/lib/assistant-api";
import { renderMarkdown } from "@/lib/markdown";

import { ProposalCard } from "./ProposalCard";

export const STORAGE_KEY = "sis-assistant-conversation";

const SUGGESTIONS = [
  "Какво да правя при косопад?",
  "Как да пазя косата от преса и маша?",
  "Има ли свободен час за подстригване тази седмица?",
];

const EMPTY_CLIENT: ClientDetails = { first_name: "", last_name: "", phone: "", email: "" };

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the conversation simply is not remembered.
  }
}

/** The chat button in the corner of every public page, and the chat panel it opens. */
export function AssistantWidget() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [client, setClient] = useState<ClientDetails>(EMPTY_CLIENT);
  const [consentGiven, setConsentGiven] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    assistantApi
      .status()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  // Load the earlier conversation and the visitor's details the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    const id = readStored();
    if (id) {
      assistantApi
        .conversation(id)
        .then((c) => {
          setConversation(c.id);
          setMessages(c.messages);
        })
        .catch(() => store(null));
    }
    accountApi
      .session()
      .then((s) => (s.authenticated && s.user?.has_profile ? accountApi.profile() : null))
      .then((p) => {
        if (!p) return;
        setClient({ first_name: p.first_name, last_name: p.last_name, phone: p.phone, email: p.email });
        setConsentGiven(p.privacy_consent);
      })
      .catch(() => undefined);
  }, [open, loaded]);

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length, sending]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (value: string) => {
      const message = value.trim();
      if (!message || sending) return;
      setError(null);
      setSending(true);
      setMessages((m) => [...m, { role: "user", text: message }]);
      setText("");
      try {
        const reply = await assistantApi.send(conversation, message);
        setConversation(reply.id);
        store(reply.id);
        setMessages(reply.messages);
      } catch (e) {
        setMessages((m) => m.slice(0, -1));
        setText(message);
        if (e instanceof ApiError && e.status === 404) {
          setConversation(null);
          store(null);
        }
        setError(e instanceof Error ? e.message : "Нещо се обърка.");
      } finally {
        setSending(false);
      }
    },
    [conversation, sending],
  );

  function restart() {
    setConversation(null);
    setMessages([]);
    setError(null);
    store(null);
    input.current?.focus();
  }

  function confirmed(updated: Proposal) {
    setMessages((all) =>
      all.map((m) => (m.proposals ? { ...m, proposals: m.proposals.map((p) => (p.id === updated.id ? updated : p)) } : m)),
    );
  }

  if (!enabled) return null;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setOpen(true)}
            className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-ink py-3 pr-5 pl-4 text-sm font-semibold text-bg shadow-[0_18px_40px_-14px_rgba(34,27,23,0.7)] transition hover:bg-accent hover:text-accent-ink sm:right-6 sm:bottom-6"
          >
            <MessageCircleHeart className="size-5" />
            Попитайте ни
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="AI асистент"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col bg-bg sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-[25rem] sm:overflow-hidden sm:rounded-3xl sm:shadow-[0_30px_80px_-24px_rgba(34,27,23,0.55)] sm:ring-1 sm:ring-line"
          >
            <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <MessageCircleHeart className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink">AI асистент</h2>
                <p className="truncate text-xs text-ink-soft">Съвети от статиите ни и свободни часове</p>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={restart}
                  title="Нов разговор"
                  aria-label="Нов разговор"
                  className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Затвори"
                className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col gap-3">
                  <p className="rounded-2xl bg-surface px-4 py-3 text-[15px] text-ink ring-1 ring-line">
                    Здравейте! Питайте ме за грижата за косата и скалпа. Отговарям по статиите на салона. Мога и да ви
                    намеря свободен час и да го запазя.
                  </p>
                  <div className="flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full bg-accent-soft/60 px-4 py-2 text-left text-sm text-ink transition hover:bg-accent-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ol aria-label="Разговор" className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <li key={i} className="flex flex-col gap-2">
                    {m.role === "user" ? (
                      <p className="max-w-[85%] self-end rounded-2xl bg-ink px-4 py-2.5 whitespace-pre-line break-words text-bg">
                        {m.text}
                      </p>
                    ) : (
                      <div className="prose-chat max-w-[92%] self-start rounded-2xl bg-surface px-4 py-3 text-[15px] text-ink ring-1 ring-line">
                        {renderMarkdown(m.text)}
                      </div>
                    )}
                    {m.proposals?.map((p) => (
                      <ProposalCard
                        key={p.id}
                        proposal={p}
                        initialClient={client}
                        consentGiven={consentGiven}
                        onConfirmed={confirmed}
                      />
                    ))}
                  </li>
                ))}
                {sending && (
                  <li className="flex items-center gap-2 self-start rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft ring-1 ring-line">
                    <LoaderCircle className="size-4 animate-spin" /> Мисля…
                  </li>
                )}
              </ol>
              <div ref={end} />
            </div>

            {error && (
              <p role="alert" className="mx-4 mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <textarea
                ref={input}
                aria-label="Вашият въпрос"
                rows={1}
                maxLength={1000}
                value={text}
                placeholder="Напишете въпрос…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-base text-ink outline-none focus:border-accent"
              />
              <button
                type="submit"
                aria-label="Изпрати"
                disabled={sending || !text.trim()}
                className={clsx(
                  "grid size-11 shrink-0 place-items-center rounded-full bg-ink text-bg transition hover:bg-accent hover:text-accent-ink disabled:opacity-40",
                )}
              >
                <SendHorizontal className="size-5" />
              </button>
            </form>
            <p className="bg-surface px-4 pb-2 text-center text-[11px] text-ink-soft">
              Асистентът е AI и може да греши. За съвет за вашата коса запазете консултация.
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
