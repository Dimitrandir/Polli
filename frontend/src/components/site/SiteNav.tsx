import Link from "next/link";

export const NAV = [
  { href: "/uslugi", label: "Услуги" },
  { href: "/za-nas", label: "Екип" },
  { href: "/statii", label: "Статии" },
  { href: "/kontakti", label: "Контакти" },
];

export function SiteNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Основно меню" className={className}>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
