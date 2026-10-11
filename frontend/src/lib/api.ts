// Typed client for the Django booking API (see the backend README).

export type SpecialistOffer = { id: number; name: string; price: string; duration_minutes: number };

export type Service = {
  id: number;
  name: string;
  description: string;
  price: string;
  duration_minutes: number;
  is_online_bookable: boolean;
  group: number;
  category: string;
  specialists: SpecialistOffer[];
};

export type ServiceGroup = { id: number; name: string; description: string; services: Service[] };
export type Category = { id: number; name: string; slug: string; groups: ServiceGroup[] };

export type ItemRequest = { service: number; specialist: number | null };

export type PlannedItem = {
  service: number;
  service_name: string;
  specialist: number;
  specialist_name: string;
  start: string;
  end: string;
  price: string;
};

export type Slot = { start: string; end: string; total_price: string; items: PlannedItem[] };
export type AvailabilityDay = { date: string; slots: Slot[] };
export type Availability = { timezone: string; days: AvailabilityDay[] };

export type BookingItem = {
  service: number;
  service_name: string;
  specialist: number;
  specialist_name: string;
  start: string;
  end: string;
  price: string;
};

export type BookingStatus = "confirmed" | "completed" | "no_show" | "cancelled";

export type Booking = {
  id: number;
  status: BookingStatus;
  start: string;
  end: string;
  note: string;
  items: BookingItem[];
  total_price: string;
  can_cancel: boolean;
  created_at: string;
  cancel_token: string;
};

export type ClientDetails = { first_name: string; last_name: string; phone: string; email: string };

export type NewBooking = {
  start: string;
  parallel: boolean;
  items: ItemRequest[];
  note: string;
  client: ClientDetails;
  consent: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const FALLBACK = "Нещо се обърка. Моля, опитайте отново след малко.";

/** Turn a DRF error body into one readable Bulgarian sentence. */
function messageFrom(body: unknown): string {
  if (!body || typeof body !== "object") return FALLBACK;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  for (const value of Object.values(record)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (value && typeof value === "object") {
      const nested = messageFrom(value);
      if (nested !== FALLBACK) return nested;
    }
  }
  return FALLBACK;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Няма връзка със сървъра. Проверете интернет връзката си.", 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(messageFrom(body), response.status, (body ?? {}) as Record<string, unknown>);
  }
  return body as T;
}

export const api = {
  categories: () => request<Category[]>("/categories"),
  availability: (payload: { date: string; days: number; parallel: boolean; items: ItemRequest[] }) =>
    request<Availability>("/availability", { method: "POST", body: JSON.stringify(payload) }),
  createBooking: (payload: NewBooking) =>
    request<Booking>("/bookings", { method: "POST", body: JSON.stringify(payload) }),
  booking: (token: string) => request<Booking>(`/bookings/${encodeURIComponent(token)}`),
  cancelBooking: (token: string, reason = "") =>
    request<Booking>(`/bookings/${encodeURIComponent(token)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
