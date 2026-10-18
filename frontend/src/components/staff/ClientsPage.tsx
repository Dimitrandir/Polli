"use client";

import { Phone, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { staffApi, type NewClient, type StaffClient } from "@/lib/staff-api";

import { ClientSheet } from "./ClientSheet";
import { Field, inputClass, Sheet } from "./Sheet";
import { StaffPage } from "./StaffNav";

/** Find a client by name, nickname or phone; call them, open their card and history, book them. */
export function ClientsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<StaffClient[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const q = query.trim();
    let stale = false;
    const timer = setTimeout(
      () => {
        staffApi
          .clients(q)
          .then((list) => {
            if (stale) return;
            setRows(list);
            setError(null);
          })
          .catch((e) => {
            if (stale) return;
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/personal/vhod");
            else setError(e instanceof ApiError ? e.message : "Не успях да заредя клиентите.");
          });
      },
      q ? 250 : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, version, router]);

  return (
    <StaffPage
      title="Клиенти"
      section="clients"
      action={
        <button aria-label="Нов клиент" onClick={() => setAdding(true)} className="p-2">
          <UserPlus size={24} />
        </button>
      }
    >
      <div className="sticky top-14 z-20 border-b border-neutral-200 bg-white px-3 py-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Име, псевдоним или телефон…"
            aria-label="Търси клиент"
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!query.trim() && rows && rows.length > 0 && (
        <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Последно записани</p>
      )}

      {rows === null ? (
        <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : rows.length === 0 ? (
        <p className="px-6 py-12 text-center text-neutral-500">
          {query.trim().length >= 2 ? "Няма такъв клиент." : "Напишете поне две букви или цифри."}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2">
              <button onClick={() => setOpen(c.id)} className="min-w-0 flex-1 py-1 text-left">
                <span className="block truncate font-medium">
                  {c.name} {c.is_blocked && "⛔"}
                  {c.nickname && <span className="font-normal text-neutral-500"> „{c.nickname}“</span>}
                </span>
                <span className="block text-sm text-neutral-500">{c.phone}</span>
              </button>
              <a
                href={`tel:${c.phone}`}
                aria-label={`Обади се на ${c.name}`}
                className="rounded-full bg-[var(--staff)] p-2.5 text-white"
              >
                <Phone size={18} />
              </a>
            </li>
          ))}
        </ul>
      )}

      {open !== null && (
        <ClientSheet
          clientId={open}
          onClose={() => {
            setOpen(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {adding && (
        <NewClientSheet
          initial={query}
          onClose={() => setAdding(false)}
          onCreated={(client) => {
            setAdding(false);
            setOpen(client.id);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </StaffPage>
  );
}

function NewClientSheet({
  initial,
  onClose,
  onCreated,
}: {
  initial: string;
  onClose: () => void;
  onCreated: (client: StaffClient) => void;
}) {
  const looksLikePhone = initial.replace(/[^\d]/g, "").length >= 6;
  const [form, setForm] = useState<NewClient>({
    first_name: looksLikePhone ? "" : initial.trim(),
    last_name: "",
    phone: looksLikePhone ? initial.trim() : "",
    email: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof NewClient) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await staffApi.createClient(form));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Нов клиент" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Име">
            <input required value={form.first_name} onChange={set("first_name")} className={inputClass} />
          </Field>
          <Field label="Фамилия">
            <input value={form.last_name} onChange={set("last_name")} className={inputClass} />
          </Field>
        </div>
        <Field label="Телефон">
          <input required type="tel" value={form.phone} onChange={set("phone")} className={inputClass} />
        </Field>
        <Field label="Имейл">
          <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
        >
          Добави клиента
        </button>
      </form>
    </Sheet>
  );
}
