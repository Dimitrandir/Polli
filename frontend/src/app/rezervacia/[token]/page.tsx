import type { Metadata } from "next";

import { ManageBooking } from "@/components/booking/ManageBooking";

export const metadata: Metadata = { title: "Вашата резервация", robots: { index: false } };

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-16">
      <ManageBooking token={token} />
    </main>
  );
}
