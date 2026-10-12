// Client accounts: login without a password (Google or a code by email), profile, messages.

import { request, type Booking } from "./api";

export type AccountUser = { email: string; name: string; has_profile: boolean; unread_messages: number };
export type AccountSession = { authenticated: boolean; user: AccountUser | null; google_client_id: string };

export type ReminderChannel = "email" | "none";

export type Profile = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  preferred_specialist: number | null;
  reminder_channel: ReminderChannel;
  privacy_consent: boolean;
  marketing_consent: boolean;
  /** False until the client has saved a name and a phone. */
  complete: boolean;
};

export type ProfileChanges = Partial<Omit<Profile, "email" | "complete">>;

export type Message = {
  id: number;
  text: string;
  from_client: boolean;
  sender_name: string;
  created_at: string;
  read_at: string | null;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const EXPORT_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/me/export`;

export const accountApi = {
  session: () => request<AccountSession>("/auth/session"),
  requestCode: (email: string) => request<{ detail: string }>("/auth/email", json("POST", { email })),
  verifyCode: (email: string, code: string) =>
    request<AccountSession>("/auth/email/verify", json("POST", { email, code })),
  google: (credential: string) => request<AccountSession>("/auth/google", json("POST", { credential })),
  logout: () => request<AccountSession>("/auth/logout", json("POST", {})),
  profile: () => request<Profile>("/me"),
  updateProfile: (changes: ProfileChanges) => request<Profile>("/me", json("PATCH", changes)),
  deleteAccount: () => request<null>("/me", { method: "DELETE" }),
  bookings: () => request<Booking[]>("/me/bookings"),
  messages: () => request<Message[]>("/me/messages"),
  sendMessage: (text: string) => request<Message>("/me/messages", json("POST", { text })),
};
