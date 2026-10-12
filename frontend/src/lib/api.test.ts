import { afterEach, describe, expect, it, vi } from "vitest";

import { api, csrfToken } from "./api";

describe("csrfToken", () => {
  it("reads Django's csrftoken cookie", () => {
    expect(csrfToken("sessionid=abc; csrftoken=t0k%3Den; theme=dark")).toBe("t0k=en");
    expect(csrfToken("csrftoken=first")).toBe("first");
    expect(csrfToken("sessionid=abc")).toBeNull();
    expect(csrfToken("")).toBeNull();
  });
});

describe("request headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("sends the CSRF token with a booking when the admin cookie is present", async () => {
    document.cookie = "csrftoken=secret";
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 201 })));
    vi.stubGlobal("fetch", fetchMock);
    await api.cancelBooking("abc");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("secret");
  });

  it("does not send a token on reads or when there is no cookie", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("[]")));
    vi.stubGlobal("fetch", fetchMock);
    await api.categories();
    await api.cancelBooking("abc");
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).not.toHaveProperty("X-CSRFToken");
    }
  });
});
