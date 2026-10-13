import { describe, expect, it } from "vitest";

import { colour, manicure, service, slot } from "@/test/fixtures";

import { canContinue, estimate, initialState, itemRequests, MAX_SERVICES, reducer } from "./booking-state";

const start = () => initialState(new Date("2026-10-15T10:00:00Z"));

describe("booking state", () => {
  it("starts on the services step in the current week", () => {
    const state = start();
    expect(state.step).toBe("services");
    expect(state.weekStart).toBe("2026-10-12");
    expect(canContinue(state)).toBe(false);
  });

  it("toggles services and pre-selects the only specialist", () => {
    let state = reducer(start(), { type: "toggleService", service: manicure });
    expect(state.specialists[manicure.id]).toBe(3);
    state = reducer(state, { type: "toggleService", service: colour });
    expect(state.specialists[colour.id]).toBeNull();
    expect(itemRequests(state)).toEqual([
      { service: 2, specialist: 3 },
      { service: 1, specialist: null },
    ]);
    state = reducer(state, { type: "toggleService", service: manicure });
    expect(state.selected.map((s) => s.id)).toEqual([colour.id]);
  });

  it("swaps one option of a service for another", () => {
    const short = service({ id: 20, name: "Кичури", option: "на половината коса" });
    const whole = service({ id: 21, name: "Кичури", option: "на цялата коса" });
    let state = reducer(start(), { type: "toggleService", service: manicure });
    state = reducer(state, { type: "toggleService", service: short });
    state = reducer(state, { type: "toggleService", service: whole });
    expect(state.selected.map((s) => s.id)).toEqual([manicure.id, whole.id]);
    expect(state.specialists).not.toHaveProperty("20");
  });

  it("limits the number of services", () => {
    let state = start();
    for (let id = 1; id <= MAX_SERVICES + 2; id++) {
      state = reducer(state, { type: "toggleService", service: service({ id }) });
    }
    expect(state.selected).toHaveLength(MAX_SERVICES);
  });

  it("clears the chosen time when the request changes", () => {
    let state = reducer(start(), { type: "toggleService", service: colour });
    state = reducer(state, { type: "toggleService", service: manicure });
    state = reducer(state, { type: "selectDay", day: "2026-10-19" });
    state = reducer(state, { type: "selectSlot", slot });
    expect(state.slot).toBe(slot);
    state = reducer(state, { type: "setParallel", parallel: true });
    expect(state.slot).toBeNull();
    expect(state.day).toBeNull();
  });

  it("drops parallel mode when only one service is left", () => {
    let state = reducer(start(), { type: "toggleService", service: colour });
    state = reducer(state, { type: "toggleService", service: manicure });
    state = reducer(state, { type: "setParallel", parallel: true });
    state = reducer(state, { type: "removeService", id: manicure.id });
    expect(state.parallel).toBe(false);
  });

  it("estimates price and duration", () => {
    let state = reducer(start(), { type: "toggleService", service: colour });
    state = reducer(state, { type: "toggleService", service: manicure });
    // Colour without a preference: cheapest offer, marked "from".
    expect(estimate(state)).toEqual({ price: 88.12, duration: 180, from: true });
    state = reducer(state, { type: "setSpecialist", serviceId: colour.id, specialistId: 1 });
    state = reducer(state, { type: "setParallel", parallel: true });
    expect(estimate(state)).toEqual({ price: 108.12, duration: 90, from: false });
  });

  it("goes back to the time step and reloads when the slot was taken", () => {
    let state = reducer(start(), { type: "toggleService", service: colour });
    state = reducer(state, { type: "selectSlot", slot });
    state = reducer(state, { type: "goTo", step: "details" });
    state = reducer(state, { type: "slotTaken" });
    expect(state.step).toBe("time");
    expect(state.slot).toBeNull();
    expect(state.version).toBe(1);
  });
});
