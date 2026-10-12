import type { Metadata } from "next";

import { AccountView } from "@/components/account/AccountView";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "Моят профил", robots: { index: false } };

export default async function ProfilePage() {
  const team = (await content.team()) ?? [];
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <AccountView specialists={team.map(({ id, name }) => ({ id, name }))} />
    </main>
  );
}
