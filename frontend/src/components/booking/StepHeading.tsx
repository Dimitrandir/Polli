export function StepHeading({ eyebrow, title, hint }: { eyebrow: string; title: string; hint?: string }) {
  return (
    <header className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">{title}</h2>
      {hint && <p className="mt-3 max-w-xl text-ink-soft">{hint}</p>}
    </header>
  );
}
