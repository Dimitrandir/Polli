"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { accountApi, type AccountUser } from "@/lib/account-api";

/** "Вход" for visitors, "Профил" (with a dot for unread messages) for logged-in clients. */
export function AccountLink() {
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);

  useEffect(() => {
    accountApi
      .session()
      .then((s) => setUser(s.user))
      .catch(() => setUser(null));
  }, [pathname]);

  return (
    <Link
      href={user ? "/profil" : "/vhod"}
      aria-label={user ? "Моят профил" : "Вход"}
      className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
    >
      <CircleUserRound className="size-5" />
      <span className="hidden sm:inline">{user ? "Профил" : "Вход"}</span>
      {user && user.unread_messages > 0 && (
        <span aria-label="нови съобщения" className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />
      )}
    </Link>
  );
}
