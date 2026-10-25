"use client";

import { CalendarDays, LogOut, Menu, MessageCircle, Scissors, Settings, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { disablePush } from "@/lib/push";
import { staffApi, type StaffUser } from "@/lib/staff-api";

const REFRESH_MS = 60_000;

let sessionPromise: Promise<StaffUser | null> | null = null;

/** The logged-in team member (loaded once per page load). Null until known or when logged out. */
export function useStaffUser(): StaffUser | null {
  const [user, setUser] = useState<StaffUser | null>(null);
  useEffect(() => {
    sessionPromise ??= staffApi
      .session()
      .then((s) => s.user)
      .catch(() => {
        sessionPromise = null;
        return null;
      });
    let alive = true;
    void sessionPromise.then((u) => alive && setUser(u));
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

/** Unread messages from clients, refreshed every minute while the page is visible. */
export function useUnread(): number {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const check = () =>
      staffApi
        .inbox()
        .then((inbox) => setUnread(inbox.unread_total))
        .catch(() => null);
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return unread;
}

/** Studio24's round chat bubble: shows how many client messages are waiting and opens them. */
export function MessagesBubble({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <Link
      href="/personal/saobshtenia"
      aria-label={`Непрочетени съобщения: ${unread}`}
      className="fixed right-5 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+5rem)] z-30 flex h-16 w-16 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg transition hover:scale-105"
    >
      <MessageCircle size={30} />
      <span className="absolute text-sm font-bold">{unread}</span>
    </Link>
  );
}

export function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100 ${active ? "font-semibold text-[var(--staff)]" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

export type Section = "calendar" | "clients" | "messages" | "team" | "services" | "settings";

/** The links to every part of the team's side; shared by the calendar menu and the other pages. */
export function SectionLinks({ current, unread }: { current?: Section; unread: number }) {
  const router = useRouter();
  const user = useStaffUser();

  async function logout() {
    await disablePush().catch(() => null);
    await staffApi.logout().catch(() => null);
    router.replace("/personal/vhod");
  }

  const go = (href: string) => () => router.push(href);
  return (
    <>
      <MenuItem icon={<CalendarDays size={18} />} label="Календар" active={current === "calendar"} onClick={go("/personal")} />
      <MenuItem icon={<UserRound size={18} />} label="Клиенти" active={current === "clients"} onClick={go("/personal/klienti")} />
      <MenuItem
        icon={<MessageCircle size={18} />}
        label={unread > 0 ? `Съобщения (${unread})` : "Съобщения"}
        active={current === "messages"}
        onClick={go("/personal/saobshtenia")}
      />
      <MenuItem icon={<Users size={18} />} label="Служители" active={current === "team"} onClick={go("/personal/sluzhiteli")} />
      <MenuItem icon={<Scissors size={18} />} label="Услуги" active={current === "services"} onClick={go("/personal/uslugi")} />
      {user?.is_admin && (
        <MenuItem
          icon={<Settings size={18} />}
          label="Настройки"
          active={current === "settings"}
          onClick={go("/personal/nastroiki")}
        />
      )}
      <MenuItem icon={<LogOut size={18} />} label="Изход" onClick={logout} />
    </>
  );
}

/** A page of the team's side other than the calendar: the teal bar with the title and the menu. */
export function StaffPage({
  title,
  section,
  action,
  children,
}: {
  title: string;
  section: Section;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = useUnread();
  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-[var(--staff)] px-3 text-white shadow">
        <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
        {action}
        <button aria-label="Меню" onClick={() => setMenuOpen((o) => !o)} className="relative p-2">
          <Menu size={28} />
          {unread > 0 && (
            <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4">
              {unread}
            </span>
          )}
        </button>
        {menuOpen && (
          <div className="absolute top-full right-2 mt-1 w-60 overflow-hidden rounded-xl bg-white text-neutral-800 shadow-xl">
            <SectionLinks current={section} unread={unread} />
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

/** Errors from the API as one sentence; a lost session sends the team member to the login page. */
export function useApiError() {
  const router = useRouter();
  return (e: unknown, fallback = "Нещо се обърка. Опитайте отново."): string => {
    if (e instanceof ApiError && e.status === 401) router.replace("/personal/vhod");
    return e instanceof ApiError ? e.message : fallback;
  };
}
