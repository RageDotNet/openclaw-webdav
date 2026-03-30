import { describe, it, expect } from "vitest";
import { SlidingWindowRateLimiter, isBulkOperation } from "../../src/adapter/rateLimiter.js";

const CONFIG = { enabled: true, max: 5, windowSeconds: 10 };

describe("SlidingWindowRateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      const result = limiter.check("192.168.1.1", now + i);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now + i);
    }

    const result = limiter.check("192.168.1.1", now + 5);
    expect(result.allowed).toBe(false);
  });

  it("includes Retry-After in the blocked response", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now);
    }

    const result = limiter.check("192.168.1.1", now + 1000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(10);
  });

  it("allows requests again after the window expires", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now);
    }

    // After window expires (10s + 1ms)
    const result = limiter.check("192.168.1.1", now + 10001);
    expect(result.allowed).toBe(true);
  });

  it("tracks different IPs independently", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now);
    }

    // Different IP should still be allowed
    const result = limiter.check("192.168.1.2", now);
    expect(result.allowed).toBe(true);
  });

  it("implements sliding window (not fixed window)", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    // Make 5 requests spread over 5 seconds
    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now + i * 1000);
    }

    // At t=5s, the first request (at t=0) is still within the 10s window
    const blocked = limiter.check("192.168.1.1", now + 5000);
    expect(blocked.allowed).toBe(false);

    // At t=10.5s, the first request (at t=0) has expired
    const allowed = limiter.check("192.168.1.1", now + 10500);
    expect(allowed.allowed).toBe(true);
  });

  it("does nothing when disabled", () => {
    const limiter = new SlidingWindowRateLimiter({ ...CONFIG, enabled: false });
    const now = Date.now();

    for (let i = 0; i < 100; i++) {
      const result = limiter.check("192.168.1.1", now + i);
      expect(result.allowed).toBe(true);
    }
  });

  it("reset() clears all state", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.check("192.168.1.1", now);
    }

    limiter.reset();

    const result = limiter.check("192.168.1.1", now);
    expect(result.allowed).toBe(true);
  });

  it("getCount() returns current request count", () => {
    const limiter = new SlidingWindowRateLimiter(CONFIG);
    const now = Date.now();

    limiter.check("192.168.1.1", now);
    limiter.check("192.168.1.1", now + 1);
    limiter.check("192.168.1.1", now + 2);

    expect(limiter.getCount("192.168.1.1", now + 2)).toBe(3);
  });
});

describe("isBulkOperation", () => {
  it("identifies PROPFIND depth:infinity as bulk", () => {
    expect(isBulkOperation("PROPFIND", { depth: "infinity" })).toBe(true);
  });

  it("identifies PROPFIND depth:Infinity (case-insensitive) as bulk", () => {
    expect(isBulkOperation("PROPFIND", { depth: "Infinity" })).toBe(true);
  });

  it("does NOT identify PROPFIND depth:0 as bulk", () => {
    expect(isBulkOperation("PROPFIND", { depth: "0" })).toBe(false);
  });

  it("does NOT identify PROPFIND depth:1 as bulk", () => {
    expect(isBulkOperation("PROPFIND", { depth: "1" })).toBe(false);
  });

  it("identifies COPY as bulk", () => {
    expect(isBulkOperation("COPY", {})).toBe(true);
  });

  it("identifies MOVE as bulk", () => {
    expect(isBulkOperation("MOVE", {})).toBe(true);
  });

  it("does NOT identify GET as bulk", () => {
    expect(isBulkOperation("GET", {})).toBe(false);
  });

  it("does NOT identify PUT as bulk", () => {
    expect(isBulkOperation("PUT", {})).toBe(false);
  });

  it("does NOT identify DELETE as bulk", () => {
    expect(isBulkOperation("DELETE", {})).toBe(false);
  });

  it("does NOT identify OPTIONS as bulk", () => {
    expect(isBulkOperation("OPTIONS", {})).toBe(false);
  });
});
