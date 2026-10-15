"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { currentTheme, setTheme, type Theme } from "@/lib/theme";

/** Switches between the light and the dark theme and remembers the choice. */
export function ThemeToggle() {
  const [theme, setState] = useState<Theme | null>(null);

  useEffect(() => setState(currentTheme()), []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Тъмна тема" : "Светла тема";
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        setState(next);
      }}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-surface-2 hover:text-ink"
    >
      {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
