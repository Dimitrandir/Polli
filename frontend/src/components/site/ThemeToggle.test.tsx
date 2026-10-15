import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_KEY } from "@/lib/theme";

import { ThemeToggle } from "./ThemeToggle";

function deviceTheme(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark && query.includes("dark"), media: query }));
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts from the device theme and remembers the visitor's choice", async () => {
    const user = userEvent.setup();
    deviceTheme(false);
    render(<ThemeToggle />);

    await user.click(await screen.findByRole("button", { name: "Тъмна тема" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Светла тема" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("offers the light theme when the device is dark", async () => {
    deviceTheme(true);
    render(<ThemeToggle />);
    expect(await screen.findByRole("button", { name: "Светла тема" })).toBeInTheDocument();
  });
});
