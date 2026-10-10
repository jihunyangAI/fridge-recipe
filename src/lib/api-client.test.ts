import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./api-client";

describe("safeCallbackUrl", () => {
  it.each(["/recipes", "/my-recipes/abc?x=1#top", "/"])("keeps same-site path %s", (value) => {
    expect(safeCallbackUrl(value)).toBe(value);
  });

  it.each([
    ["absolute URL", "https://evil.com"],
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["tab trick", "/\t/evil.com"],
    ["newline trick", "/\n/evil.com"],
    ["carriage return trick", "/\r/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["empty", ""],
    ["missing", null],
  ])("falls back for %s", (_label, value) => {
    expect(safeCallbackUrl(value)).toBe("/");
  });
});
