"use client";

import clsx from "clsx";
import { CalendarPlus, Lock, Pencil, Phone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Message } from "@/lib/account-api";
import { ApiError } from "@/lib/api";
import { formatLongDate, formatPrice, formatShortDate, formatTime } from "@/lib/format";
import { staffApi, type ClientCard, type ClientChanges, type ClientNote } from "@/lib/staff-api";
import { usePolling } from "@/lib/use-polling";

import { ChatThread } from "../chat/ChatThread";
import { Field, inputClass, Sheet } from "./Sheet";

type Tab = "card" | "messages";

const STATUS: Record<ClientCard["bookings"][number]["status"], string> = {
  confirmed: "потвърдена",
  completed: "изпълнена",
  no_show: "неявяване",
  cancelled: "отказана",
};

const MESSAGES_REFRESH_MS = 5_000;

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

  // The client's replies show up while the conversation is open.
  const pollMessages = useCallback(() => staffApi.messages(clientId).then(setMessages), [clientId]);
  usePolling(pollMessages, MESSAGES_REFRESH_MS, tab === "messages");

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
  const router = useRouter();
  const [nickname, setNickname] = useState(card.nickname);
  const [notes, setNotes] = useState(card.notes);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function saveClient(changes: ClientChanges) {
    setBusy(true);
    try {
      onChange(await staffApi.updateClient(card.id, changes));
      return true;
    } catch (e) {
      onError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toggleBlock() {
    if (card.is_blocked) {
      void saveClient({ is_blocked: false });
      return;
    }
    const reason = window.prompt("Да блокирам ли клиента за онлайн резервации? Причина (по желание):", "");
    if (reason === null) return;
    void saveClient({ is_blocked: true, blocked_reason: reason });
  }

  const stats = card.stats;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`tel:${card.phone}`}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--staff)] px-4 py-2 text-sm font-semibold text-white"
        >
          <Phone size={16} /> {card.phone}
        </a>
        <button
          onClick={() => router.push(`/personal?klient=${card.id}`)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--staff)] px-4 py-2 text-sm font-semibold text-[var(--staff)]"
        >
          <CalendarPlus size={16} /> Запиши час
        </button>
        <button
          onClick={() => setEditing((e) => !e)}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
        >
          <Pencil size={14} /> Редактирай
        </button>
      </div>
      {card.email && <p className="text-sm text-neutral-600">{card.email}</p>}
      {card.is_blocked && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          ⛔ Блокиран за онлайн резервации{card.blocked_reason ? `: ${card.blocked_reason}` : ""}
        </p>
      )}

      {editing && (
        <ContactsForm
          card={card}
          busy={busy}
          onSave={async (changes) => {
            if (await saveClient(changes)) setEditing(false);
          }}
          onToggleBlock={toggleBlock}
        />
      )}

      {stats && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="посещения" value={String(stats.visits)} />
          <Stat label="неявявания" value={String(stats.no_shows)} />
          <Stat label="отказани" value={String(stats.cancelled)} />
          <Stat label="похарчени" value={formatPrice(stats.spent)} />
        </div>
      )}
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
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">История на посещенията</p>
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
                {b.total && <span className="float-right text-neutral-700">{formatPrice(b.total)}</span>}
                <span className="block text-neutral-600">
                  {b.services}
                  {b.specialists && <span className="text-neutral-500"> · {b.specialists}</span>}
                </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-1 py-2">
      <p className="text-base font-semibold text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function ContactsForm({
  card,
  busy,
  onSave,
  onToggleBlock,
}: {
  card: ClientCard;
  busy: boolean;
  onSave: (changes: ClientChanges) => void;
  onToggleBlock: () => void;
}) {
  const [form, setForm] = useState({
    first_name: card.first_name,
    last_name: card.last_name,
    phone: card.phone,
    email: card.email,
  });
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-3 rounded-xl border border-neutral-200 p-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Име">
          <input required value={form.first_name} onChange={set("first_name")} className={inputClass} />
        </Field>
        <Field label="Фамилия">
          <input value={form.last_name} onChange={set("last_name")} className={inputClass} />
        </Field>
        <Field label="Телефон">
          <input required type="tel" value={form.phone} onChange={set("phone")} className={inputClass} />
        </Field>
        <Field label="Имейл">
          <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Запази
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleBlock}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
        >
          {card.is_blocked ? "Отблокирай" : "Блокирай"}
        </button>
        {card.created_at && (
          <span className="text-xs text-neutral-500">Клиент от {formatShortDate(card.created_at)}</span>
        )}
      </div>
    </form>
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
