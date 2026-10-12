import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function BookingCta({ text = "Изберете услуга, специалист и удобен час онлайн." }: { text?: string }) {
  return (
    <section className="my-20 flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-surface/70 p-8 ring-1 ring-line backdrop-blur sm:flex-row sm:items-center sm:p-10">
      <p className="max-w-xl font-display text-3xl font-semibold leading-tight text-ink">{text}</p>
      <Link
        href="/rezervacia"
        className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-ink px-7 py-3.5 font-semibold text-bg transition hover:bg-accent hover:text-accent-ink"
      >
        Запази час
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </section>
  );
}
