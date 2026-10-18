"use client";

import clsx from "clsx";
import { Camera, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { specialistColor } from "@/lib/calendar";
import { mediaPath } from "@/lib/site";
import { staffApi, type Hours, type TeamMember, type TeamMemberChanges } from "@/lib/staff-api";

import { HoursEditor } from "./HoursEditor";
import { Field, inputClass, Sheet } from "./Sheet";
import { StaffPage, useStaffUser } from "./StaffNav";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");

/** Everyone on the team: photo, description (the same as on the website), hours and rights. */
export function TeamPage() {
  const router = useRouter();
  const user = useStaffUser();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await staffApi.team());
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/personal/vhod");
      else setError(errorText(e));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = team?.find((m) => m.id === open) ?? null;

  return (
    <StaffPage
      title="Служители"
      section="team"
      action={
        user?.is_admin && (
          <button aria-label="Добави служител" onClick={() => setAdding(true)} className="p-2">
            <UserPlus size={24} />
          </button>
        )
      }
    >
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {team === null ? (
        <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {team.map((m, index) => {
            const photo = mediaPath(m.photo);
            return (
              <li key={m.id}>
                <button
                  onClick={() => setOpen(m.id)}
                  className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left", !m.is_active && "opacity-50")}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                      style={{ background: specialistColor(m.color, index) }}
                    >
                      {m.name.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {m.name}
                      {m.is_me && <span className="text-xs font-normal text-neutral-500">(вие)</span>}
                      {m.login?.is_admin && <ShieldCheck size={16} className="text-[var(--staff)]" aria-label="администратор" />}
                    </span>
                    <span className="block truncate text-sm text-neutral-500">
                      {m.is_active ? m.title || "—" : "Не работи в момента"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <MemberSheet
          key={selected.id}
          member={selected}
          isAdmin={Boolean(user?.is_admin)}
          onClose={() => setOpen(null)}
          onSaved={(m) => setTeam((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? null)}
        />
      )}
      {adding && (
        <AddMemberSheet
          onClose={() => setAdding(false)}
          onAdded={(m) => {
            setAdding(false);
            setTeam((list) => [...(list ?? []), m]);
            setOpen(m.id);
          }}
        />
      )}
    </StaffPage>
  );
}

type Tab = "profile" | "hours" | "rights";

function MemberSheet({
  member,
  isAdmin,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (member: TeamMember) => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<TeamMember>, done = "Запазено.") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      onSaved(await action());
      setNotice(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const tabs: [Tab, string][] = [
    ["profile", "Профил"],
    ["hours", "Работно време"],
    ...(isAdmin ? ([["rights", "Права"]] as [Tab, string][]) : []),
  ];

  return (
    <Sheet title={member.name} onClose={onClose}>
      <div className={`mb-4 grid rounded-xl bg-neutral-100 p-1 text-sm font-semibold ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("rounded-lg py-2", tab === t ? "bg-white text-neutral-900 shadow" : "text-neutral-500")}
          >
            {label}
          </button>
        ))}
      </div>

      {!member.can_edit && (
        <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Само администратор или самият служител може да променя профила.
        </p>
      )}

      {tab === "profile" && <ProfileTab member={member} busy={busy} run={run} />}
      {tab === "hours" && <HoursTab member={member} busy={busy} run={run} />}
      {tab === "rights" && isAdmin && <RightsTab member={member} busy={busy} run={run} />}

      {notice && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Sheet>
  );
}

type Run = (action: () => Promise<TeamMember>, done?: string) => Promise<boolean>;

function ProfileTab({ member, busy, run }: { member: TeamMember; busy: boolean; run: Run }) {
  const [form, setForm] = useState({ name: member.name, title: member.title, bio: member.bio, color: member.color });
  const file = useRef<HTMLInputElement>(null);
  const photo = mediaPath(member.photo);
  const disabled = !member.can_edit;
  const changed =
    form.name !== member.name || form.title !== member.title || form.bio !== member.bio || form.color !== member.color;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={member.name} className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <Camera size={32} />
          </span>
        )}
        {!disabled && (
          <div className="flex flex-col gap-2">
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) void run(() => staffApi.uploadPhoto(member.id, chosen), "Снимката е сменена.");
                e.target.value = "";
              }}
            />
            <button
              disabled={busy}
              onClick={() => file.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Camera size={16} /> {photo ? "Смени снимката" : "Сложи снимка"}
            </button>
            {photo && (
              <button
                disabled={busy}
                onClick={() =>
                  window.confirm("Да махна ли снимката?") &&
                  void run(() => staffApi.deletePhoto(member.id), "Снимката е махната.")
                }
                className="inline-flex items-center gap-2 text-sm text-red-700"
              >
                <Trash2 size={14} /> Махни
              </button>
            )}
          </div>
        )}
      </div>

      <Field label="Име">
        <input
          disabled={disabled}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Позиция">
        <input
          disabled={disabled}
          value={form.title}
          placeholder="напр. Колорист, трихолог"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Представяне (показва се на сайта)">
        <textarea
          disabled={disabled}
          rows={6}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Цвят в календара">
        <div className="flex items-center gap-3">
          <input
            type="color"
            disabled={disabled}
            value={form.color || "#17a2b0"}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-10 w-16 rounded border border-neutral-300"
          />
          {form.color && !disabled && (
            <button onClick={() => setForm({ ...form, color: "" })} className="text-sm text-neutral-500">
              автоматичен
            </button>
          )}
        </div>
      </Field>
      {changed && !disabled && (
        <button
          disabled={busy || !form.name.trim()}
          onClick={() => run(() => staffApi.updateTeamMember(member.id, form))}
          className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
        >
          Запази
        </button>
      )}
    </div>
  );
}

function HoursTab({ member, busy, run }: { member: TeamMember; busy: boolean; run: Run }) {
  const [hours, setHours] = useState<Hours[]>(member.working_hours);
  const changed = JSON.stringify(hours) !== JSON.stringify(member.working_hours);
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Редовната седмица. За отделен ден (отпуска, лекар) блокирайте време направо от календара с „+“.
      </p>
      <HoursEditor value={hours} onChange={setHours} disabled={!member.can_edit} />
      {changed && member.can_edit && (
        <button
          disabled={busy}
          onClick={async () => {
            await run(async () => {
              const saved = await staffApi.setHours(member.id, hours);
              setHours(saved.working_hours);
              return saved;
            }, "Работното време е запазено.");
          }}
          className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
        >
          Запази работното време
        </button>
      )}
    </div>
  );
}

function RightsTab({ member, busy, run }: { member: TeamMember; busy: boolean; run: Run }) {
  const [username, setUsername] = useState(member.login?.username ?? "");
  const [password, setPassword] = useState("");
  const save = (changes: TeamMemberChanges, done?: string) => run(() => staffApi.updateTeamMember(member.id, changes), done);

  return (
    <div className="space-y-4">
      <Toggle
        label="Работи в момента"
        hint="Изключеният служител не се вижда в календара и на сайта и не може да влиза."
        checked={member.is_active}
        disabled={busy || member.is_me}
        onChange={(v) => {
          if (!v && !window.confirm(`Да изключа ли ${member.name}?`)) return;
          void save({ is_active: v }, v ? "Служителят е включен." : "Служителят е изключен.");
        }}
      />
      <Toggle
        label="Онлайн резервации"
        hint="Клиентите могат да избират служителя на сайта."
        checked={member.is_online_bookable}
        disabled={busy}
        onChange={(v) => void save({ is_online_bookable: v })}
      />
      <Toggle
        label="Администратор"
        hint="Управлява всички служители, услугите и настройките."
        checked={Boolean(member.login?.is_admin)}
        disabled={busy || member.is_me || !member.login}
        onChange={(v) => void save({ is_admin: v })}
      />

      <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
        <p className="text-sm font-semibold text-neutral-900">
          {member.login ? "Вход в системата" : "Още няма вход – създайте го"}
        </p>
        <Field label="Потребителско име">
          <input
            value={username}
            autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={member.login ? "Нова парола (празно = без промяна)" : "Парола"}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <button
          disabled={busy || !username.trim() || (!member.login && !password)}
          onClick={async () => {
            const ok = await save(
              { username: username.trim(), ...(password ? { password } : {}) },
              member.login ? "Входът е обновен." : "Входът е създаден.",
            );
            if (ok) setPassword("");
          }}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Запази входа
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={clsx("flex items-start gap-3", disabled && "opacity-60")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 accent-[var(--staff)]"
      />
      <span>
        <span className="block font-medium text-neutral-900">{label}</span>
        <span className="block text-sm text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

function AddMemberSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (m: TeamMember) => void }) {
  const [form, setForm] = useState({ name: "", title: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(
        await staffApi.addTeamMember({
          name: form.name,
          title: form.title,
          ...(form.username ? { username: form.username, password: form.password } : {}),
        }),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Нов служител" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Име">
          <input required value={form.name} onChange={set("name")} className={inputClass} />
        </Field>
        <Field label="Позиция">
          <input value={form.title} onChange={set("title")} placeholder="напр. Маникюрист" className={inputClass} />
        </Field>
        <p className="text-sm text-neutral-600">
          Вход в системата (по желание, може и после). Работното време и услугите се добавят след това.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Потребителско име">
            <input autoCapitalize="none" value={form.username} onChange={set("username")} className={inputClass} />
          </Field>
          <Field label="Парола">
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
              className={inputClass}
            />
          </Field>
        </div>
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
          Добави
        </button>
      </form>
    </Sheet>
  );
}
