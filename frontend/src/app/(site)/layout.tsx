import Link from "next/link";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div aria-hidden className="backdrop-glow pointer-events-none fixed inset-0 -z-10" />
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold tracking-tight text-ink">SIS</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ink-soft">
              Esthetics Hair
            </span>
          </Link>
          <SiteNav className="hidden items-center gap-1 md:flex" />
          <Link
            href="/rezervacia"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent hover:text-accent-ink"
          >
            Запази час
          </Link>
        </div>
        <SiteNav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 md:hidden" />
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
