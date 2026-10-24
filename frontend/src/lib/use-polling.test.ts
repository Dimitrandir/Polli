import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "./use-polling";

describe("usePolling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls again every interval while visible and stops when unmounted", () => {
    const fn = vi.fn().mockResolvedValue(null);
    const { unmount } = renderHook(() => usePolling(fn, 5000));
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does nothing when turned off", () => {
    const fn = vi.fn().mockResolvedValue(null);
    renderHook(() => usePolling(fn, 5000, false));
    vi.advanceTimersByTime(20_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("refreshes when the page becomes visible again", () => {
    const fn = vi.fn().mockResolvedValue(null);
    renderHook(() => usePolling(fn, 60_000));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
