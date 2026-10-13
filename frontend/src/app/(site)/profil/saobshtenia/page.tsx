import type { Metadata } from "next";

import { ClientMessages } from "@/components/account/ClientMessages";

export const metadata: Metadata = { title: "Съобщения", robots: { index: false } };

export default function ClientMessagesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-16">
      <ClientMessages />
    </main>
  );
}
