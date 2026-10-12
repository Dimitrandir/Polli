// Client for the salon team's API (/api/staff/*). Needs a staff login; the session cookie does the rest.

import { request } from "./api";
import type { BookingStatus } from "./api";

export type StaffUser = { username: string; name: string; specialist: number | null };
export type StaffSession = { authenticated: boolean; user: StaffUser | null };

export type Interval = { start: string; end: string };

export type DaySpecialist = {
  id: number;
  name: string;
  color: string;
  is_online_bookable: boolean;
  working: Interval[];
  time_off: (Interval & { reason: string })[];
};

export type StaffClient = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  notes: string;
  is_blocked: boolean;
};

export type StaffItem = {
  id: number;
  service: number;
  service_name: string;
  specialist: number;
  start: string;
  end: string;
  price: string;
};

export type StaffBooking = {
  id: number;
  status: BookingStatus;
  source: "online" | "salon";
  start: string;
  end: string;
  note: string;
  internal_note: string;
  client: StaffClient;
  items: StaffItem[];
  total_price: string;
  created_at: string;
};

export type DaySchedule = {
  date: string;
  timezone: string;
  specialists: DaySpecialist[];
  bookings: StaffBooking[];
};

export type StaffService = {
  id: number;
  name: string;
  group: string;
  specialists: { id: number; price: string; duration_minutes: number }[];
};

export type NewClient = { first_name: string; last_name: string; phone: string; email: string };

export type NewStaffBooking = {
  client?: number;
  new_client?: NewClient;
  specialist: number;
  services: number[];
  /** Salon time without an offset, e.g. "2026-10-19T10:15:00". */
  start: string;
  internal_note: string;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const staffApi = {
  session: () => request<StaffSession>("/staff/session"),
  login: (username: string, password: string) =>
    request<StaffSession>("/staff/login", json("POST", { username, password })),
  logout: () => request<StaffSession>("/staff/logout", json("POST", {})),
  day: (date: string) => request<DaySchedule>(`/staff/day?date=${encodeURIComponent(date)}`),
  services: () => request<StaffService[]>("/staff/services"),
  clients: (q: string) => request<StaffClient[]>(`/staff/clients?q=${encodeURIComponent(q)}`),
  createBooking: (payload: NewStaffBooking) => request<StaffBooking>("/staff/bookings", json("POST", payload)),
  updateBooking: (id: number, changes: { status?: BookingStatus; internal_note?: string }) =>
    request<StaffBooking>(`/staff/bookings/${id}`, json("PATCH", changes)),
  cancelBooking: (id: number, reason = "") =>
    request<StaffBooking>(`/staff/bookings/${id}/cancel`, json("POST", { reason })),
};
