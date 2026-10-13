"use client";

import clsx from "clsx";
import { Search, X } from "lucide-react";

export function SearchField({
  value,
  onChange,
  placeholder = "Търсене на услуга, напр. кичури, педикюр…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label="Търсене на услуга"
        className="w-full rounded-full bg-surface py-3 pl-11 pr-11 text-sm text-ink ring-1 ring-line outline-none transition placeholder:text-ink-soft/80 focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Изчисти търсенето"
          className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
