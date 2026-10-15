// Light or dark theme. Without a choice the site follows the device; a choice made with the
// button in the header is remembered in this browser and set as data-theme on <html>.

export type Theme = "light" | "dark";

export const THEME_KEY = "sis-theme";

/** Runs in <head> before the page paints, so a remembered theme never flashes the other one. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice lasts until the page is closed.
  }
}
