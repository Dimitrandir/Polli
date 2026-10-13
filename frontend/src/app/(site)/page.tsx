import { ArrowRight, Leaf, Palette, Sparkles } from "lucide-react";
import Link from "next/link";

const HIGHLIGHTS = [
  { icon: Palette, title: "Колористика", text: "Балеаж, кичури и цвят, създаден за вас от колорист с 25+ години опит." },
  { icon: Leaf, title: "Трихология", text: "Диагностика и терапии за здрава коса и скалп." },
  { icon: Sparkles, title: "Маникюр и педикюр", text: "Гел лак и грижа – дори едновременно с услуга за коса." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-8">
      <section className="flex min-h-[78dvh] flex-col justify-center py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Салон за красота · София</p>
        <h1 className="mt-6 max-w-4xl font-display text-6xl font-semibold leading-[0.95] text-ink sm:text-8xl">
          Красотата е в <em className="text-accent">детайла</em>.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft">
          Изберете услуга, специалист и удобен час – резервацията отнема по-малко от минута.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/rezervacia"
            className="group inline-flex items-center gap-3 rounded-full bg-ink px-8 py-4 font-semibold text-bg shadow-[0_20px_50px_-20px_rgba(34,27,23,0.7)] transition hover:bg-accent hover:text-accent-ink"
          >
            Запази час
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-24 md:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-[2rem] bg-surface/70 p-8 ring-1 ring-line backdrop-blur">
            <Icon className="size-6 text-accent" />
            <h2 className="mt-6 font-display text-3xl font-semibold text-ink">{title}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
