"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { staffApi, type Hours, type SalonSettings } from "@/lib/staff-api";

import { HoursEditor } from "./HoursEditor";
import { Field, inputClass } from "./Sheet";
import { StaffPage, useStaffUser } from "./StaffNav";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");

/** Salon settings: how far ahead and how soon clients book online, online cancellation, opening hours. */
export function SettingsPage() {
  const router = useRouter();
  const user = useStaffUser();
  const [saved, setSaved] = useState<SalonSettings | null>(null);
  const [rules, setRules] = useState({ max_days_ahead: 0, min_notice_minutes: 0, cancellation_hours: 0 });
  const [hours, setHours] = useState<Hours[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function apply(data: SalonSettings) {
    setSaved(data);
    setRules({
      max_days_ahead: data.max_days_ahead,
      min_notice_minutes: data.min_notice_minutes,
      cancellation_hours: data.cancellation_hours,
    });
    setHours(data.opening_hours);
  }

  useEffect(() => {
    staffApi
      .settings()
      .then(apply)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/personal/vhod");
        else setError(errorText(e));
      });
  }, [router]);

  const readOnly = !user?.is_admin;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await staffApi.updateSettings({ ...rules, opening_hours: hours }));
      setNotice("Настройките са запазени.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const number = (field: keyof typeof rules) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRules({ ...rules, [field]: Number(e.target.value) });

  return (
    <StaffPage title="Настройки" section="settings">
      {saved === null ? (
        error ? (
          <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <div className="m-4 h-40 animate-pulse rounded-xl bg-neutral-100" />
        )
      ) : (
        <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-4 pb-24">
          {readOnly && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              Само администратор може да променя настройките.
            </p>
          )}
          <section className="space-y-3">
            <h2 className="text-base font-bold">Онлайн записване</h2>
            <Field label="Колко дни напред могат да се записват клиентите">
              <input
                type="number"
                min={1}
                max={365}
                disabled={readOnly}
                value={rules.max_days_ahead}
                onChange={number("max_days_ahead")}
                className={inputClass}
              />
            </Field>
            <Field label="Най-рано след колко минути от момента">
              <input
                type="number"
                min={0}
                step={15}
                disabled={readOnly}
                value={rules.min_notice_minutes}
                onChange={number("min_notice_minutes")}
                className={inputClass}
              />
            </Field>
            <Field label="Клиентът може сам да откаже до (часа преди часа)">
              <input
                type="number"
                min={0}
                disabled={readOnly}
                value={rules.cancellation_hours}
                onChange={number("cancellation_hours")}
                className={inputClass}
              />
            </Field>
            <p className="text-xs text-neutral-500">
              Салонът може да записва без тези ограничения от календара.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold">Работно време на салона</h2>
            <p className="text-sm text-neutral-600">
              Показва се на сайта. Часовете на всеки служител се задават от „Служители“.
            </p>
            <HoursEditor value={hours} onChange={setHours} disabled={readOnly} defaultDay={{ start: "10:00", end: "19:00" }} />
          </section>

          {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {!readOnly && (
            <button
              onClick={save}
              disabled={busy}
              className="w-full rounded-xl bg-[var(--staff)] py-3 font-semibold text-white disabled:opacity-60"
            >
              Запази
            </button>
          )}
        </div>
      )}
    </StaffPage>
  );
}
