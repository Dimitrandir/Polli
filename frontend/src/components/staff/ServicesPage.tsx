"use client";

import clsx from "clsx";
import { FolderPlus, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/lib/api";
import { formatDuration, formatPrice } from "@/lib/format";
import { staffApi, type Catalog, type CatalogOffer, type CatalogService, type ServiceInput } from "@/lib/staff-api";

import { Field, inputClass, Sheet } from "./Sheet";
import { StaffPage, useStaffUser } from "./StaffNav";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");

/** The price list: everyone can look, an administrator edits services, prices and who does them. */
export function ServicesPage() {
  const router = useRouter();
  const user = useStaffUser();
  const isAdmin = Boolean(user?.is_admin);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCatalog(await staffApi.catalog());
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/personal/vhod");
      else setError(errorText(e));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const categories = useMemo(
    () =>
      (catalog?.categories ?? []).map((c) => ({
        ...c,
        groups: c.groups
          .map((g) => ({
            ...g,
            services: g.services.filter(
              (s) => !q || s.display_name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
            ),
          }))
          .filter((g) => !q || g.services.length > 0),
      })),
    [catalog, q],
  );

  async function addGroup(categoryId: number) {
    const name = window.prompt("Име на новата група услуги:");
    if (!name?.trim()) return;
    try {
      await staffApi.createGroup(categoryId, name.trim());
      void load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function renameGroup(id: number, current: string, active: boolean) {
    const name = window.prompt("Ново име на групата (празно = без промяна):", current);
    if (name === null) return;
    const hide = !name.trim() && window.confirm(active ? "Да скрия ли групата от сайта?" : "Да покажа ли групата отново?");
    try {
      await staffApi.updateGroup(id, name.trim() ? { name: name.trim() } : hide ? { is_active: !active } : {});
      void load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <StaffPage
      title="Услуги"
      section="services"
      action={
        isAdmin && (
          <button aria-label="Нова услуга" onClick={() => setEditing("new")} className="p-2">
            <Plus size={26} />
          </button>
        )
      }
    >
      <div className="sticky top-14 z-20 border-b border-neutral-200 bg-white px-3 py-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Търси услуга…"
            aria-label="Търси услуга"
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!isAdmin && user && (
        <p className="bg-neutral-50 px-4 py-2 text-sm text-neutral-600">Услугите и цените се променят от администратор.</p>
      )}

      {catalog === null ? (
        <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : (
        categories.map((c) => (
          <section key={c.id} className="pb-2">
            <h2 className="flex items-center justify-between bg-neutral-100 px-4 py-2 text-sm font-bold tracking-wide text-neutral-700 uppercase">
              {c.name}
              {isAdmin && (
                <button aria-label={`Нова група в ${c.name}`} onClick={() => addGroup(c.id)} className="p-1 text-neutral-500">
                  <FolderPlus size={18} />
                </button>
              )}
            </h2>
            {c.groups.map((g) => (
              <div key={g.id} className={clsx(!g.is_active && "opacity-50")}>
                <button
                  disabled={!isAdmin}
                  onClick={() => renameGroup(g.id, g.name, g.is_active)}
                  className="w-full px-4 pt-3 pb-1 text-left text-sm font-semibold text-[var(--staff)]"
                >
                  {g.name}
                  {!g.is_active && " (скрита)"}
                </button>
                <ul className="divide-y divide-neutral-100">
                  {g.services.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setEditing(s)}
                        className={clsx("flex w-full items-center gap-3 px-4 py-2.5 text-left", !s.is_active && "opacity-50")}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block">{s.display_name}</span>
                          <span className="block text-xs text-neutral-500">
                            {formatDuration(s.duration_minutes)}
                            {!s.is_active && " · изключена"}
                            {s.is_active && !s.is_online_bookable && " · само от салона"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold">{formatPrice(s.price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {editing && catalog && (
        <ServiceSheet
          service={editing === "new" ? null : editing}
          catalog={catalog}
          readOnly={!isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </StaffPage>
  );
}

function ServiceSheet({
  service,
  catalog,
  readOnly,
  onClose,
  onSaved,
}: {
  service: CatalogService | null;
  catalog: Catalog;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const firstGroup = catalog.categories.flatMap((c) => c.groups)[0]?.id ?? 0;
  const [form, setForm] = useState<ServiceInput>(
    service ?? {
      group: firstGroup,
      name: "",
      option: "",
      description: "",
      price: "",
      duration_minutes: 60,
      buffer_minutes: 0,
      order: 0,
      is_active: true,
      is_online_bookable: true,
      specialists: [],
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ServiceInput>(field: K, value: ServiceInput[K]) => setForm({ ...form, [field]: value });
  const offerOf = (id: number) => form.specialists.find((o) => o.id === id);

  function toggleSpecialist(id: number, on: boolean) {
    set(
      "specialists",
      on ? [...form.specialists, { id, price: null, duration_minutes: null }] : form.specialists.filter((o) => o.id !== id),
    );
  }

  function setOffer(id: number, changes: Partial<CatalogOffer>) {
    set(
      "specialists",
      form.specialists.map((o) => (o.id === id ? { ...o, ...changes } : o)),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (service) await staffApi.updateService(service.id, form);
      else await staffApi.createService(form);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={service ? service.display_name : "Нова услуга"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <fieldset disabled={readOnly || busy} className="space-y-3">
          <Field label="Група">
            <select value={form.group} onChange={(e) => set("group", Number(e.target.value))} className={inputClass}>
              {catalog.categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Име">
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Опция (напр. „на дълга коса“)">
            <input value={form.option} onChange={(e) => set("option", e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Цена €">
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(e) => set("price", e.target.value.replace(",", "."))}
                className={inputClass}
              />
            </Field>
            <Field label="Минути">
              <input
                required
                type="number"
                min={5}
                step={5}
                value={form.duration_minutes}
                onChange={(e) => set("duration_minutes", Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Подготовка">
              <input
                type="number"
                min={0}
                step={5}
                value={form.buffer_minutes}
                onChange={(e) => set("buffer_minutes", Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Описание">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="h-5 w-5 accent-[var(--staff)]"
            />
            Активна (изключената не се записва и не се вижда)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_online_bookable}
              onChange={(e) => set("is_online_bookable", e.target.checked)}
              className="h-5 w-5 accent-[var(--staff)]"
            />
            Клиентите я записват онлайн
          </label>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Кой я прави</p>
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {catalog.specialists
                .filter((s) => s.is_active || offerOf(s.id))
                .map((s) => {
                  const offer = offerOf(s.id);
                  return (
                    <li key={s.id} className="px-3 py-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(offer)}
                          onChange={(e) => toggleSpecialist(s.id, e.target.checked)}
                          className="h-5 w-5 accent-[var(--staff)]"
                        />
                        <span className="flex-1">{s.name}</span>
                      </label>
                      {offer && (
                        <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
                          <input
                            inputMode="decimal"
                            aria-label={`Цена при ${s.name}`}
                            placeholder={`цена ${form.price || "–"} €`}
                            value={offer.price ?? ""}
                            onChange={(e) => setOffer(s.id, { price: e.target.value.replace(",", ".") || null })}
                            className={`${inputClass} py-1.5 text-sm`}
                          />
                          <input
                            type="number"
                            min={5}
                            step={5}
                            aria-label={`Минути при ${s.name}`}
                            placeholder={`${form.duration_minutes} мин`}
                            value={offer.duration_minutes ?? ""}
                            onChange={(e) =>
                              setOffer(s.id, { duration_minutes: e.target.value ? Number(e.target.value) : null })
                            }
                            className={`${inputClass} py-1.5 text-sm`}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
            <p className="mt-1 text-xs text-neutral-500">Празна цена или време = стандартните за услугата.</p>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!readOnly && (
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
          >
            {service ? "Запази" : "Добави услугата"}
          </button>
        )}
      </form>
    </Sheet>
  );
}
