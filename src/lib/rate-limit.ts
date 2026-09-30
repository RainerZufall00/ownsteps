import "server-only";

/**
 * Small in-memory sliding window, like the comment brake in comments.ts.
 * One instance per purpose; state resets on restart, which is fine for an
 * instance serving a group of friends.
 */
export function createRateLimit(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return function allow(key: string) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < options.windowMs);
    if (recent.length >= options.max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);

    // Memory must not grow without bound.
    if (hits.size > 1000) {
      for (const [entry, times] of hits) {
        if (times.every((t) => now - t >= options.windowMs)) hits.delete(entry);
      }
    }
    return true;
  };
}

/** The client's address as the reverse proxy reports it. */
export function clientAddress(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
