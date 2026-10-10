import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("limits after N hits within the window and recovers after it", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock });
    for (let i = 0; i < 3; i++) {
      expect(limiter.isLimited("ip:1")).toBe(false);
      limiter.hit("ip:1");
    }
    expect(limiter.isLimited("ip:1")).toBe(true);
    expect(limiter.isLimited("ip:2")).toBe(false);
    clock = 1001;
    expect(limiter.isLimited("ip:1")).toBe(false);
  });

  it("forgets expired keys once it grows past the sweep threshold", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => clock, sweepAt: 5 });
    for (let i = 0; i < 5; i++) limiter.hit(`email:old${i}`);
    clock = 2000;
    limiter.hit("email:new");
    expect(limiter.size()).toBe(1);
  });

  it("is limited when any of the keys is (IP or email)", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    limiter.hit("ip:a", "email:x");
    limiter.hit("ip:b", "email:x");
    // 다른 IP에서도 같은 이메일로는 막힌다.
    expect(limiter.isLimited("ip:c", "email:x")).toBe(true);
    expect(limiter.isLimited("ip:c", "email:y")).toBe(false);
  });
});
