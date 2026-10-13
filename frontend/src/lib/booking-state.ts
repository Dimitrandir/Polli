import type { Booking, ItemRequest, Service, Slot } from "./api";
import { startOfWeek, todayKey } from "./format";

export const MAX_SERVICES = 6;

export type Step = "services" | "specialists" | "time" | "details" | "done";
export const STEPS: { id: Exclude<Step, "done">; label: string }[] = [
  { id: "services", label: "Услуги" },
  { id: "specialists", label: "Специалист" },
  { id: "time", label: "Дата и час" },
  { id: "details", label: "Вашите данни" },
];

export type BookingState = {
  step: Step;
  selected: Service[];
  /** Chosen specialist per service id; null = no preference. */
  specialists: Record<number, number | null>;
  parallel: boolean;
  weekStart: string;
  day: string | null;
  slot: Slot | null;
  booking: Booking | null;
  /** Bumped when free times must be reloaded (e.g. someone else took the chosen time). */
  version: number;
};

export type Action =
  | { type: "toggleService"; service: Service }
  | { type: "removeService"; id: number }
  | { type: "setSpecialist"; serviceId: number; specialistId: number | null }
  | { type: "setParallel"; parallel: boolean }
  | { type: "goTo"; step: Step }
  | { type: "setWeek"; weekStart: string }
  | { type: "selectDay"; day: string }
  | { type: "selectSlot"; slot: Slot }
  | { type: "slotTaken" }
  | { type: "booked"; booking: Booking }
  | { type: "reset" };

export function initialState(now: Date = new Date()): BookingState {
  return {
    step: "services",
    selected: [],
    specialists: {},
    parallel: false,
    weekStart: startOfWeek(todayKey(now)),
    day: null,
    slot: null,
    booking: null,
    version: 0,
  };
}

// Anything that changes what is being booked invalidates the chosen time.
const clearTime = { day: null, slot: null } as const;

export function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "toggleService": {
      const exists = state.selected.some((s) => s.id === action.service.id);
      if (exists) return reducer(state, { type: "removeService", id: action.service.id });
      // Picking another option of the same service ("на дълга коса" instead of "на къса коса") replaces it.
      const sibling = state.selected.find((s) => isSameService(s, action.service));
      if (sibling) state = reducer(state, { type: "removeService", id: sibling.id });
      if (state.selected.length >= MAX_SERVICES) return state;
      const only = action.service.specialists.length === 1 ? action.service.specialists[0].id : null;
      return {
        ...state,
        ...clearTime,
        selected: [...state.selected, action.service],
        specialists: { ...state.specialists, [action.service.id]: only },
      };
    }
    case "removeService": {
      const selected = state.selected.filter((s) => s.id !== action.id);
      const specialists = { ...state.specialists };
      delete specialists[action.id];
      return {
        ...state,
        ...clearTime,
        selected,
        specialists,
        parallel: selected.length > 1 && state.parallel,
        step: selected.length ? state.step : "services",
      };
    }
    case "setSpecialist":
      return { ...state, ...clearTime, specialists: { ...state.specialists, [action.serviceId]: action.specialistId } };
    case "setParallel":
      return { ...state, ...clearTime, parallel: action.parallel && state.selected.length > 1 };
    case "goTo":
      return { ...state, step: action.step };
    case "setWeek":
      return { ...state, weekStart: action.weekStart, ...clearTime };
    case "selectDay":
      return { ...state, day: action.day, slot: null };
    case "selectSlot":
      return { ...state, slot: action.slot };
    case "slotTaken":
      return { ...state, slot: null, step: "time", version: state.version + 1 };
    case "booked":
      return { ...state, booking: action.booking, step: "done" };
    case "reset":
      return initialState();
  }
}

/** Two options of one service: same group and name, e.g. "Кичури" on the whole or half of the hair. */
export function isSameService(a: Service, b: Service): boolean {
  return a.id !== b.id && a.group === b.group && a.name === b.name;
}

export function itemRequests(state: BookingState): ItemRequest[] {
  return state.selected.map((s) => ({ service: s.id, specialist: state.specialists[s.id] ?? null }));
}

/** Price and duration of a service for the chosen specialist (or the cheapest/standard offer). */
export function offerFor(service: Service, specialistId: number | null) {
  const chosen = service.specialists.find((o) => o.id === specialistId);
  if (chosen) return { price: Number(chosen.price), duration: chosen.duration_minutes, from: false };
  const prices = service.specialists.map((o) => Number(o.price));
  const min = prices.length ? Math.min(...prices) : Number(service.price);
  const varies = prices.some((p) => p !== min);
  return { price: min, duration: service.duration_minutes, from: varies };
}

/** Estimated total before a time is chosen. */
export function estimate(state: BookingState) {
  const offers = state.selected.map((s) => offerFor(s, state.specialists[s.id] ?? null));
  const price = offers.reduce((sum, o) => sum + o.price, 0);
  const durations = offers.map((o) => o.duration);
  const duration = state.parallel ? Math.max(0, ...durations) : durations.reduce((a, b) => a + b, 0);
  return { price, duration, from: offers.some((o) => o.from) };
}

export function canContinue(state: BookingState): boolean {
  switch (state.step) {
    case "services":
      return state.selected.length > 0;
    case "specialists":
      return state.selected.length > 0;
    case "time":
      return state.slot !== null;
    default:
      return false;
  }
}

export function nextStep(step: Step): Step {
  const order: Step[] = ["services", "specialists", "time", "details", "done"];
  return order[Math.min(order.indexOf(step) + 1, order.length - 1)];
}

export function previousStep(step: Step): Step {
  const order: Step[] = ["services", "specialists", "time", "details"];
  return order[Math.max(order.indexOf(step) - 1, 0)];
}
