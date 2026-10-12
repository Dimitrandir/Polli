"use client";

import clsx from "clsx";
import { Lock, Pencil, Phone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Message } from "@/lib/account-api";
import { ApiError } from "@/lib/api";
import { formatLongDate, formatTime } from "@/lib/format";
import { staffApi, type ClientCard, type ClientNote } from "@/lib/staff-api";

import { ChatThread } from "../chat/ChatThread";
import { Field, inputClass, Sheet } from "./Sheet";

type Tab = "card" | "messages";

const STATUS: Record<ClientCard["bookings"][number]["status"], string> = {
  confirmed: "потвърдена",
  completed: "изпълнена",
  no_show: "неявяване",
  cancelled: "отказана",
};

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");

/** Everything about one client for the team: nickname, notes, private notes, visits and messages. */
export function ClientSheet({
  clientId,
  initialTab = "card",
  onClose,
}: {
  clientId: number;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [card, setCard] = useState<ClientCard | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(
    () => staffApi.messages(clientId).then(setMessages).catch((e) => setError(errorText(e))),
    [clientId],
  );

  useEffect(() => {
    staffApi.client(clientId).then(setCard).catch((e) => setError(errorText(e)));
  }, [clientId]);

  useEffect(() => {
    if (tab === "messages") void loadMessages();
  }, [tab, loadMessages]);

  async function send(text: string) {
    setError(null);
    try {
      const message = await staffApi.sendMessage(clientId, text);
      setMessages((list) => [...(list ?? []), message]);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  return (
    <Sheet title={card ? card.name : "Клиент"} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
        {(["card", "messages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("rounded-lg py-2", tab === t ? "bg-white text-neutral-900 shadow" : "text-neutral-500")}
          >
            {t === "card" ? "Карта" : "Съобщения"}
            {t === "messages" && card && card.unread_messages > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--staff)] px-1.5 text-xs text-white">{card.unread_messages}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!card ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : tab === "card" ? (
        <CardTab card={card} onChange={setCard} onError={(e) => setError(errorText(e))} />
      ) : messages === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : (
        <div className="text-neutral-900">
          <ChatThread
            messages={messages}
            side="salon"
            onSend={send}
            disabled={card.has_account ? null : "Клиентът няма профил на сайта и не може да получава съобщения. Обадете се по телефона."}
            placeholder="Отговор до клиента…"
            ownBubble="bg-[var(--staff)] text-white"
            otherBubble="bg-neutral-100 text-neutral-900"
            meta="text-neutral-500"
          />
        </div>
      )}
    </Sheet>
  );
}

function CardTab({
  card,
  onChange,
  onError,
}: {
  card: ClientCard;
  onChange: (card: ClientCard) => void;
  onError: (e: unknown) => void;
}) {
  const [nickname, setNickname] = useState(card.nickname);
  const [notes, setNotes] = useState(card.notes);
  const [busy, setBusy] = useState(false);

  async function saveClient(changes: { nickname?: string; notes?: string }) {
    setBusy(true);
    try {
      onChange(await staffApi.updateClient(card.id, changes));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`tel:${card.phone}`}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--staff)] px-4 py-2 text-sm font-semibold text-white"
        >
          <Phone size={16} /> {card.phone}
        </a>
        {card.email && <span className="text-sm text-neutral-600">{card.email}</span>}
        {card.is_blocked && <span className="text-sm text-red-600">⛔ блокиран</span>}
      </div>
      {card.preferred_specialist && (
        <p className="text-sm text-neutral-600">Любим специалист: {card.preferred_specialist}</p>
      )}

      <div>
        <Field label="Псевдоним (вижда се само от салона)">
          <input
            value={nickname}
            placeholder="напр. Митко"
            onChange={(e) => setNickname(e.target.value)}
            className={inputClass}
          />
        </Field>
        {nickname.trim() !== card.nickname && (
          <SaveButton disabled={busy} onClick={() => saveClient({ nickname })} />
        )}
      </div>

      <div>
        <Field label="Общи бележки на салона">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        {notes.trim() !== card.notes && <SaveButton disabled={busy} onClick={() => saveClient({ notes })} />}
      </div>

      <PrivateNotes card={card} onChange={onChange} onError={onError} />

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Последни посещения</p>
        {card.bookings.length === 0 ? (
          <p className="text-sm text-neutral-500">Още няма.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {card.bookings.map((b) => (
              <li key={b.id} className="px-3 py-2 text-sm">
                <span className="font-medium text-neutral-900">
                  {formatLongDate(b.start)}, {formatTime(b.start)}
                </span>
                <span className="text-neutral-500"> · {STATUS[b.status]}</span>
                <span className="block text-neutral-600">{b.services}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PrivateNotes({
  card,
  onChange,
  onError,
}: {
  card: ClientCard;
  onChange: (card: ClientCard) => void;
  onError: (e: unknown) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ClientNote | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<ClientNote[]>) {
    setBusy(true);
    try {
      onChange({ ...card, my_notes: await action() });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void run(async () => {
      if (editing) {
        const note = await staffApi.updateNote(editing.id, text);
        setEditing(null);
        setDraft("");
        return card.my_notes.map((n) => (n.id === note.id ? note : n));
      }
      const note = await staffApi.addNote(card.id, text);
      setDraft("");
      return [note, ...card.my_notes];
    });
  };

  const remove = (note: ClientNote) => {
    if (!window.confirm("Да изтрия ли бележката?")) return;
    void run(async () => {
      await staffApi.deleteNote(note.id);
      return card.my_notes.filter((n) => n.id !== note.id);
    });
  };

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <Lock size={12} /> Моите бележки (виждате ги само вие)
      </p>
      <ul className="space-y-2">
        {card.my_notes.map((note) => (
          <li key={note.id} className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950">
            <p className="flex-1 whitespace-pre-line">{note.text}</p>
            <button
              aria-label="Редактирай бележката"
              onClick={() => {
                setEditing(note);
                setDraft(note.text);
              }}
              className="p-1 text-sky-700"
            >
              <Pencil size={14} />
            </button>
            <button aria-label="Изтрий бележката" onClick={() => remove(note)} className="p-1 text-sky-700">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          aria-label="Нова лична бележка"
          value={draft}
          placeholder={editing ? "Редактиране…" : "Нова бележка…"}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {editing ? "Запази" : "Добави"}
        </button>
      </form>
    </div>
  );
}

function SaveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      Запази
    </button>
  );
}
