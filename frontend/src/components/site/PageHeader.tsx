import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="pb-12 pt-14 sm:pt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">{eyebrow}</p>
      <h1 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.95] text-ink sm:text-7xl">
        {title}
      </h1>
      {children && <div className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{children}</div>}
    </header>
  );
}
