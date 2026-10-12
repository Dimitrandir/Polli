import type { Metadata } from "next";

import { BookingWizard } from "@/components/booking/BookingWizard";

export const metadata: Metadata = { title: "Запази час" };

export default function BookingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-14">
      <BookingWizard />
    </main>
  );
}
