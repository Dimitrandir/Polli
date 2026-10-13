import type { Metadata } from "next";

import { BookingWizard } from "@/components/booking/BookingWizard";

export const metadata: Metadata = { title: "Запази час" };

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ usluga?: string }> }) {
  // /rezervacia?usluga=12 starts with that service already chosen (the links on /uslugi).
  const preselect = Number((await searchParams).usluga) || undefined;
  return (
    <main className="mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-14">
      <BookingWizard preselect={preselect} />
    </main>
  );
}
