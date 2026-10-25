// Push notifications on this device (Web Push). The browser keeps them coming while the site is closed.

import { request } from "./api";

export type PushState =
  | "loading"
  /** The server has no push keys yet. */
  | "off-server"
  /** This browser cannot do push at all. */
  | "unsupported"
  /** iPhone/iPad: push works only from the site added to the home screen. */
  | "ios-home-screen"
  /** The person blocked notifications for the site in the browser settings. */
  | "denied"
  | "off"
  | "on";

type PushStatus = { enabled: boolean; public_key: string };

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export function isIos(ua: string = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The server's public key, from base64url to the bytes the browser wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "loading";
  if (!supported()) return isIos() && !isStandalone() ? "ios-home-screen" : "unsupported";
  const status = await request<PushStatus>("/push");
  if (!status.enabled) return "off-server";
  if (Notification.permission === "denied") return "denied";
  const subscription = await currentSubscription();
  if (subscription && Notification.permission === "granted") {
    // Tell the server again: it may have been made while logged in as someone else.
    await request("/push/subscribe", json(subscription.toJSON())).catch(() => null);
    return "on";
  }
  return "off";
}

// Without a connection to the browser's push service, subscribe() can wait forever.
const SUBSCRIBE_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("push subscribe timed out")), SUBSCRIBE_TIMEOUT_MS),
    ),
  ]);
}

/** Ask for permission and subscribe this device. Must run from a tap (iOS requires it). */
export async function enablePush(): Promise<PushState> {
  const status = await request<PushStatus>("/push");
  if (!status.enabled) return "off-server";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await withTimeout(
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.public_key) }),
    ));
  await request("/push/subscribe", json(subscription.toJSON()));
  return "on";
}

/** Stop notifications on this device; also used before logging out, so a shared phone stops getting them. */
export async function disablePush(): Promise<PushState> {
  if (typeof window === "undefined" || !supported()) return "off";
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return "off";
  await request("/push/unsubscribe", json({ endpoint: subscription.endpoint })).catch(() => null);
  await subscription.unsubscribe().catch(() => false);
  return "off";
}
