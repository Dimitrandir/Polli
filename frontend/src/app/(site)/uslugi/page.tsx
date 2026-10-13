import type { Metadata } from "next";

import { BookingCta } from "@/components/site/BookingCta";
import { PageHeader } from "@/components/site/PageHeader";
import { ServicesCatalog } from "@/components/site/ServicesCatalog";
import { Unavailable } from "@/components/site/Unavailable";
import { content } from "@/lib/content";

export const metadata: Metadata = {
  title: "Услуги и цени",
  description: "Подстригване, стайлинг, боядисване, кичури, балеаж, терапии за коса, маникюр и педикюр.",
};

export default async function ServicesPage() {
  const categories = await content.categories();
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-8">
      <PageHeader eyebrow="Услуги" title="Услуги и цени">
        Цената може леко да се различава според специалиста. Точната сума виждате при резервацията.
      </PageHeader>
      {!categories ? (
        <Unavailable what="Услугите" />
      ) : (
        <ServicesCatalog categories={categories} />
      )}
      <BookingCta />
    </main>
  );
}
