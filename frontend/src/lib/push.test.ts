import { describe, expect, it } from "vitest";

import { isIos, keyBytes } from "./push";

describe("keyBytes", () => {
  it("decodes the server's base64url key", () => {
    expect(Array.from(keyBytes("BAEC_-8"))).toEqual([4, 1, 2, 255, 239]);
  });
});

describe("isIos", () => {
  it("spots iPhones but not Android", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIos("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(false);
  });
});
