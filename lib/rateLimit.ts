import { NextRequest, NextResponse } from "next/server";

// In-process sliding-window rate limiter.
// For multi-region Vercel deployments a Redis-backed solution would be needed;
// for single-region this is sufficient for abuse prevention on public endpoints.

const windows = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of windows) {
    if (v.resetAt < now) windows.delete(k);
  }
}, 60_000);

export function checkRateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number }
): { ok: boolean; response?: NextResponse } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const key = `${req.nextUrl.pathname}:${ip}`;
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  entry.count += 1;
  if (entry.count > opts.limit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
          },
        }
      ),
    };
  }

  return { ok: true };
}
