import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `ms` while the page is visible, and right away when the page becomes
 * visible again (back to the tab, phone unlocked). Errors are ignored: the next round retries.
 */
export function usePolling(fn: () => Promise<unknown>, ms: number, enabled = true) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") void latest.current().catch(() => null);
    };
    const timer = window.setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ms, enabled]);
}
