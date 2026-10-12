"use client";

import { useEffect, useRef } from "react";

type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Google script failed to load")));
  });
}

/** Google's own "Sign in with Google" button. It hands back an ID token that the backend checks. */
export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        const google = window.google;
        if (cancelled || !google || !container.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential) });
        google.accounts.id.renderButton(container.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "bg",
          width: 320,
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={container} className="flex min-h-11 justify-center" />;
}
