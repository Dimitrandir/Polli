"use client";

import { ArrowRight, Download, LogOut, MessageCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { accountApi, EXPORT_URL, type Profile, type ProfileChanges } from "@/lib/account-api";
import { ApiError, type Booking } from "@/lib/api";

import { BookingCard } from "../booking/BookingCard";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { ProfileForm, type SpecialistOption } from "./ProfileForm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 font-display text-3xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function AccountView({ specialists }: { specialists: SpecialistOption[] }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    accountApi
      .session()
      .then(async (session) => {
        if (!session.authenticated) {
          router.replace("/vhod?next=/profil");
          return;
        }
        setUnread(session.user?.unread_messages ?? 0);
        const [p, b] = await Promise.all([accountApi.profile(), accountApi.bookings()]);
        setProfile(p);
        setBookings(b);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново."));
  }, [router]);

  async function save(changes: ProfileChanges) {
    try {
      setProfile(await accountApi.updateProfile(changes));
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.";
    }
  }

  async function logout() {
    await accountApi.logout().catch(() => null);
    router.replace("/");
    router.refresh();
  }

  async function deleteAccount() {
    const ok = window.confirm(
      "Да изтрием ли профила ви? Личните ви данни и съобщенията ще бъдат изтрити, а бъдещите ви часове – отказани. Това не може да се върне.",
    );
    if (!ok) return;
    try {
      await accountApi.deleteAccount();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!profile) return <Skeleton className="h-96" />;

  if (!profile.complete) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Профил</p>
        <h1 className="mt-2 font-display text-5xl font-semibold text-ink">Довършете профила си</h1>
        <p className="mt-3 mb-8 text-ink-soft">
          Трябват ни име и телефон, за да ви записваме часове и да се свържем с вас при нужда.
        </p>
        <ProfileForm profile={profile} specialists={specialists} onSave={save} />
      </div>
    );
  }

  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.status === "confirmed" && new Date(b.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Профил</p>
          <h1 className="mt-2 font-display text-5xl font-semibold text-ink">Здравейте, {profile.first_name}</h1>
        </div>
        <Button variant="ghost" onClick={logout}>
          <LogOut className="size-4" /> Изход
        </Button>
      </div>

      <Link
        href="/profil/saobshtenia"
        className="mt-8 flex items-center gap-4 rounded-[2rem] bg-surface p-5 ring-1 ring-line transition hover:ring-accent/60"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MessageCircle className="size-6" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-ink">Съобщения със салона</span>
          <span className="block text-sm text-ink-soft">
            {unread === 0
              ? "Пишете ни за час, цвят или въпрос"
              : unread === 1
                ? "Имате 1 ново съобщение"
                : `Имате ${unread} нови съобщения`}
          </span>
        </span>
        {unread > 0 && <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-accent-ink">{unread}</span>}
        <ArrowRight className="size-5 text-ink-soft" />
      </Link>

      <Section title="Предстоящи часове">
        {upcoming.length === 0 ? (
          <div className="flex flex-wrap items-center gap-4 text-ink-soft">
            Нямате запазени часове.
            <Link href="/rezervacia" className="font-semibold text-ink underline underline-offset-4">
              Запазете час
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((b) => (
              <div key={b.id}>
                <BookingCard booking={b} />
                <Link
                  href={`/rezervacia/${b.cancel_token}`}
                  className="mt-2 inline-block text-sm font-semibold text-ink-soft underline underline-offset-4"
                >
                  Календар и отказ
                </Link>
              </div>
            ))}
          </div>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="История">
          <div className="space-y-4">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Моите данни">
        <ProfileForm profile={profile} specialists={specialists} onSave={save} />
      </Section>

      <Section title="Поверителност">
        <p className="mb-5 max-w-2xl text-ink-soft">
          Можете да изтеглите всичко, което пазим за вас, или да изтриете профила си. При изтриване посещенията остават
          в статистиката на салона, но без име, телефон и имейл.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={EXPORT_URL}
            className="inline-flex items-center gap-2 rounded-full bg-surface px-6 py-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-accent/60"
          >
            <Download className="size-4" /> Изтегли моите данни
          </a>
          <Button variant="ghost" onClick={deleteAccount} className="text-danger">
            <Trash2 className="size-4" /> Изтрий профила
          </Button>
        </div>
      </Section>
    </div>
  );
}
