/**
 * Sliding-window rate limiter per IP address.
 * Counts requests in a configurable time window and returns 429 when exceeded.
 *
 * Bulk operations (PROPFIND depth:infinity, COPY/MOVE) are counted as a single
 * request to avoid false positives during normal WebDAV client usage.
 */

export interface RateLimitConfig {
  enabled: boolean;
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest request in the window expires */
  retryAfter?: number;
}

/**
 * Determines whether a request should be counted as a single "bulk" operation
 * (not subject to per-request counting beyond 1).
 *
 * PROPFIND with Depth: infinity and COPY/MOVE are bulk operations.
 */
export function isBulkOperation(method: string, headers: Record<string, string | string[] | undefined>): boolean {
  if (method === "PROPFIND") {
    const depth = (headers["depth"] as string | undefined)?.toLowerCase();
    return depth === "infinity";
  }
  return method === "COPY" || method === "MOVE";
}

/**
 * In-memory sliding-window rate limiter.
 * Tracks request timestamps per IP in a Map.
 */
export class SlidingWindowRateLimiter {
  private readonly windows: Map<string, number[]> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check and record a request from the given IP.
   * Returns { allowed: true } if within limit, or { allowed: false, retryAfter } if exceeded.
   */
  check(ip: string, nowMs?: number): RateLimitResult {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const now = nowMs ?? Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const cutoff = now - windowMs;

    // Get or create the request timestamp list for this IP
    let timestamps = this.windows.get(ip);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(ip, timestamps);
    }

    // Remove timestamps outside the window (sliding window)
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.config.max) {
      // Rate limit exceeded — calculate when the oldest request will expire
      const oldestTs = timestamps[0];
      const retryAfter = Math.ceil((oldestTs + windowMs - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    // Record this request
    timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Clear all rate limit state (useful for testing).
   */
  reset(): void {
    this.windows.clear();
  }

  /**
   * Get current request count for an IP (for testing/monitoring).
   */
  getCount(ip: string, nowMs?: number): number {
    const now = nowMs ?? Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const cutoff = now - windowMs;
    const timestamps = this.windows.get(ip);
    if (!timestamps) return 0;
    return timestamps.filter((t) => t >= cutoff).length;
  }
}
