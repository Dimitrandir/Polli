// Client for the salon team's API (/api/staff/*). Needs a staff login; the session cookie does the rest.

import { request } from "./api";
import type { BookingStatus } from "./api";
import type { Message } from "./account-api";

export type StaffUser = { username: string; name: string; specialist: number | null; is_admin?: boolean };
export type StaffSession = { authenticated: boolean; user: StaffUser | null };

export type Interval = { start: string; end: string };

export type TimeOff = Interval & { id: number; reason: string };

export type StaffSpecialist = { id: number; name: string; color: string; is_online_bookable: boolean };

export type DaySpecialist = StaffSpecialist & { working: Interval[]; time_off: TimeOff[] };

export type StaffClient = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  /** What the team calls the client ("Митко"); only the salon sees it. */
  nickname?: string;
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
  /** Who booked, moved, changed or cancelled the visit, oldest first. */
  history?: BookingEvent[];
  /** False when the visit is a colleague's: only an administrator, its specialists and whoever booked it change it. */
  can_edit?: boolean;
};

export type BookingEvent = { at: string; who: string; text: string };

export type MonthLoad = {
  month: string;
  specialists: StaffSpecialist[];
  /** date -> specialist id -> 0 (free) … 1 (full). A specialist missing on a day does not work then. */
  days: Record<string, Record<string, number>>;
};

export type Hours = { weekday: number; start: string; end: string };

export type TeamMember = {
  id: number;
  name: string;
  title: string;
  bio: string;
  photo: string | null;
  color: string;
  order: number;
  is_active: boolean;
  is_online_bookable: boolean;
  working_hours: Hours[];
  login: { username: string; is_admin: boolean; is_active: boolean } | null;
  is_me: boolean;
  can_edit: boolean;
};

export type TeamMemberChanges = Partial<{
  name: string;
  title: string;
  bio: string;
  color: string;
  order: number;
  is_active: boolean;
  is_online_bookable: boolean;
  is_admin: boolean;
  username: string;
  password: string;
}>;

export type CatalogOffer = { id: number; price: string | null; duration_minutes: number | null };

export type CatalogService = {
  id: number;
  group: number;
  name: string;
  option: string;
  display_name: string;
  description: string;
  price: string;
  duration_minutes: number;
  buffer_minutes: number;
  order: number;
  is_active: boolean;
  is_online_bookable: boolean;
  specialists: CatalogOffer[];
};

export type CatalogGroup = { id: number; name: string; is_active: boolean; services: CatalogService[] };
export type CatalogCategory = { id: number; name: string; is_active: boolean; groups: CatalogGroup[] };
export type Catalog = {
  categories: CatalogCategory[];
  specialists: { id: number; name: string; is_active: boolean }[];
};

export type ServiceInput = Omit<CatalogService, "id" | "display_name">;

export type SalonSettings = {
  max_days_ahead: number;
  min_notice_minutes: number;
  cancellation_hours: number;
  defaults: { max_days_ahead: number; min_notice_minutes: number; cancellation_hours: number };
  opening_hours: Hours[];
};

export type ClientChanges = Partial<{
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  nickname: string;
  notes: string;
  is_blocked: boolean;
  blocked_reason: string;
}>;

export type DaySchedule = {
  date: string;
  timezone: string;
  specialists: DaySpecialist[];
  bookings: StaffBooking[];
};

export type WeekSchedule = {
  /** Monday of the week. */
  start: string;
  timezone: string;
  specialist: number | null;
  specialists: StaffSpecialist[];
  days: { date: string; working: Interval[]; time_off: TimeOff[] }[];
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

export type ClientNote = { id: number; text: string; created_at: string; updated_at: string };

export type RecentService = { service: number; last_used: string };

export type ClientCard = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  nickname: string;
  phone: string;
  email: string;
  notes: string;
  is_blocked: boolean;
  blocked_reason?: string;
  created_at?: string;
  stats?: { visits: number; no_shows: number; cancelled: number; last_visit: string | null; spent: string };
  has_account: boolean;
  preferred_specialist: string | null;
  my_notes: ClientNote[];
  bookings: {
    id: number;
    start: string;
    status: BookingStatus;
    services: string;
    specialists?: string;
    total?: string;
  }[];
  unread_messages: number;
};

export type Conversation = {
  client: { id: number; name: string; nickname: string; phone: string };
  last_message: { text: string; from_client: boolean; created_at: string };
  unread: number;
};

export type Inbox = { unread_total: number; conversations: Conversation[] };

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const staffApi = {
  session: () => request<StaffSession>("/staff/session"),
  login: (username: string, password: string) =>
    request<StaffSession>("/staff/login", json("POST", { username, password })),
  logout: () => request<StaffSession>("/staff/logout", json("POST", {})),
  day: (date: string) => request<DaySchedule>(`/staff/day?date=${encodeURIComponent(date)}`),
  week: (date: string, specialist: number | null) =>
    request<WeekSchedule>(
      `/staff/week?date=${encodeURIComponent(date)}${specialist ? `&specialist=${specialist}` : ""}`,
    ),
  services: () => request<StaffService[]>("/staff/services"),
  clients: (q: string) => request<StaffClient[]>(`/staff/clients?q=${encodeURIComponent(q)}`),
  createBooking: (payload: NewStaffBooking) => request<StaffBooking>("/staff/bookings", json("POST", payload)),
  updateBooking: (id: number, changes: { status?: BookingStatus; internal_note?: string }) =>
    request<StaffBooking>(`/staff/bookings/${id}`, json("PATCH", changes)),
  cancelBooking: (id: number, reason = "") =>
    request<StaffBooking>(`/staff/bookings/${id}/cancel`, json("POST", { reason })),
  /** Drag and drop: `item` is the grabbed service, `start` its new salon time without an offset. */
  moveBooking: (id: number, move: { item: number; start: string; specialist: number }) =>
    request<StaffBooking>(`/staff/bookings/${id}/move`, json("POST", move)),
  createTimeOff: (block: { specialist: number; start: string; end: string; reason: string }) =>
    request<TimeOff>("/staff/time-off", json("POST", block)),
  deleteTimeOff: (id: number) => request<null>(`/staff/time-off/${id}`, { method: "DELETE" }),
  client: (id: number) => request<ClientCard>(`/staff/clients/${id}`),
  /** What the client had lately, newest first: a new booking offers these at the top. */
  recentServices: (id: number) => request<RecentService[]>(`/staff/clients/${id}/recent-services`),
  updateClient: (id: number, changes: ClientChanges) =>
    request<ClientCard>(`/staff/clients/${id}`, json("PATCH", changes)),
  createClient: (client: NewClient) => request<StaffClient>("/staff/clients", json("POST", client)),
  booking: (id: number) => request<StaffBooking>(`/staff/bookings/${id}`),
  month: (date: string) => request<MonthLoad>(`/staff/month?date=${encodeURIComponent(date)}`),
  team: () => request<TeamMember[]>("/staff/team"),
  addTeamMember: (member: TeamMemberChanges) => request<TeamMember>("/staff/team", json("POST", member)),
  updateTeamMember: (id: number, changes: TeamMemberChanges) =>
    request<TeamMember>(`/staff/team/${id}`, json("PATCH", changes)),
  setHours: (id: number, hours: Hours[]) => request<TeamMember>(`/staff/team/${id}/hours`, json("PUT", hours)),
  uploadPhoto: (id: number, file: File) => {
    const body = new FormData();
    body.append("photo", file);
    return request<TeamMember>(`/staff/team/${id}/photo`, { method: "POST", body });
  },
  deletePhoto: (id: number) => request<TeamMember>(`/staff/team/${id}/photo`, { method: "DELETE" }),
  catalog: () => request<Catalog>("/staff/catalog"),
  createService: (service: ServiceInput) =>
    request<CatalogService>("/staff/catalog/services", json("POST", service)),
  updateService: (id: number, changes: Partial<ServiceInput>) =>
    request<CatalogService>(`/staff/catalog/services/${id}`, json("PATCH", changes)),
  createGroup: (category: number, name: string) =>
    request<CatalogGroup>("/staff/catalog/groups", json("POST", { category, name })),
  updateGroup: (id: number, changes: { name?: string; is_active?: boolean }) =>
    request<CatalogGroup>(`/staff/catalog/groups/${id}`, json("PATCH", changes)),
  settings: () => request<SalonSettings>("/staff/settings"),
  updateSettings: (changes: Partial<Omit<SalonSettings, "defaults">>) =>
    request<SalonSettings>("/staff/settings", json("PATCH", changes)),
  addNote: (clientId: number, text: string) =>
    request<ClientNote>(`/staff/clients/${clientId}/notes`, json("POST", { text })),
  updateNote: (id: number, text: string) => request<ClientNote>(`/staff/notes/${id}`, json("PATCH", { text })),
  deleteNote: (id: number) => request<null>(`/staff/notes/${id}`, { method: "DELETE" }),
  messages: (clientId: number) => request<Message[]>(`/staff/clients/${clientId}/messages`),
  sendMessage: (clientId: number, text: string) =>
    request<Message>(`/staff/clients/${clientId}/messages`, json("POST", { text })),
  inbox: () => request<Inbox>("/staff/messages"),
};
