import type { Metadata } from "next";

import { LoginPanel } from "@/components/account/LoginPanel";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="px-4 py-12 sm:px-8 sm:py-16">
      <LoginPanel next={next} />
    </main>
  );
}
