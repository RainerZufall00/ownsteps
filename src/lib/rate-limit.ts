import "server-only";

/**
 * In-memory sliding windows. State resets on restart, which is fine for an
 * instance serving a group of friends.
 *
 * Each limiter is registered on `globalThis` by name: Server Actions and
 * route handlers can end up in separate bundles, and the web login and the
 * app's token endpoint must count against the same budget.
 */
export type RateLimit = {
  /** Counts an attempt and says whether it's still within the limit. */
  allow(key: string): boolean;
  /** Whether the key is over the limit, without counting anything. */
  blocked(key: string): boolean;
  /** Counts an attempt (e.g. a failed one) without checking. */
  record(key: string): void;
  reset(): void;
};

const registry = ((globalThis as unknown as { __ownstepsLimits?: Map<string, RateLimit> })
  .__ownstepsLimits ??= new Map<string, RateLimit>());

/** Tests start every case with full budgets. */
export function resetRateLimits() {
  for (const limit of registry.values()) limit.reset();
}

export function createRateLimit(
  name: string,
  options: { windowMs: number; max: number },
): RateLimit {
  const existing = registry.get(name);
  if (existing) return existing;

  const hits = new Map<string, number[]>();

  function recent(key: string, now: number) {
    return (hits.get(key) ?? []).filter((t) => now - t < options.windowMs);
  }

  function prune(now: number) {
    // Memory must not grow without bound.
    if (hits.size <= 1000) return;
    for (const [entry, times] of hits) {
      if (times.every((t) => now - t >= options.windowMs)) hits.delete(entry);
    }
  }

  const limit: RateLimit = {
    allow(key) {
      const now = Date.now();
      const times = recent(key, now);
      if (times.length >= options.max) {
        hits.set(key, times);
        return false;
      }
      times.push(now);
      hits.set(key, times);
      prune(now);
      return true;
    },
    blocked(key) {
      return recent(key, Date.now()).length >= options.max;
    },
    record(key) {
      const now = Date.now();
      const times = recent(key, now);
      times.push(now);
      hits.set(key, times);
      prune(now);
    },
    reset() {
      hits.clear();
    },
  };
  registry.set(name, limit);
  return limit;
}

/**
 * How many reverse proxies in front of the server append to
 * `X-Forwarded-For` – the client is the entry they saw, counted from the
 * right. Entries further left come from the client itself and can be
 * anything, so they must never decide which bucket a request counts against.
 */
export const TRUSTED_PROXIES = Math.max(
  0,
  Number.parseInt(process.env.TRUSTED_PROXIES ?? "1", 10) || 0,
);

/** The client's address as the trusted reverse proxy reports it. */
export function clientAddress(headers: Headers, trustedProxies = TRUSTED_PROXIES) {
  if (trustedProxies > 0) {
    const chain = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const entry = chain[chain.length - trustedProxies];
    if (entry) return entry;
  }
  // Directly exposed (no proxy configured) or the proxy didn't say: one
  // shared bucket – the per-account and per-trip limits still hold.
  return "unknown";
}
