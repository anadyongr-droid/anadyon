import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Rate limiting backed by the database rather than by process memory.
 *
 * The previous implementation counted in a per-process Map. Vercel Functions
 * run across instances and regions and are recycled between requests, so every
 * cold start began with an empty counter — a caller hitting an endpoint hard
 * enough to matter was very likely to be served by a fresh instance each time.
 * The limit existed in the code without existing in practice.
 *
 * One round trip is added to each public POST. That is the cost of a limit that
 * actually holds, and these endpoints send email or write rows, so the database
 * was already in the path.
 */

/**
 * The client address, preferring the header the platform sets itself.
 *
 * `x-forwarded-for` is caller-supplied and trivially spoofed, which would let
 * one attacker present as unlimited distinct clients. Vercel sets
 * `x-vercel-forwarded-for` from the connection it terminated, so it is used
 * first where present.
 */
function clientIp(req: NextRequest): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();

  return "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  response?: NextResponse;
}

/**
 * Counts this request against `key` and refuses it once the limit is passed.
 *
 * Fails **open** on a database error. A limiter that rejects every request when
 * its store is unreachable converts a transient database problem into a total
 * outage of the booking form, which is a worse failure than the abuse it
 * guards against — and the endpoints behind it are also protected by reCAPTCHA.
 * The failure is logged so it does not pass silently.
 */
export async function checkRateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number; key?: string }
): Promise<RateLimitResult> {
  const scope = opts.key ?? req.nextUrl.pathname;
  const key = `${scope}:${clientIp(req)}`;
  const windowSeconds = Math.max(1, Math.round(opts.windowMs / 1000));

  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("Rate limit check failed, allowing request:", error.message);
      return { ok: true };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed !== false) return { ok: true };

    const resetsAt = row?.resets_at ? new Date(row.resets_at) : null;
    const retryAfter = resetsAt
      ? Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000))
      : windowSeconds;

    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          // Tells a well-behaved client when to come back instead of leaving it
          // to retry immediately and be refused again.
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(opts.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      ),
    };
  } catch (err) {
    console.error("Rate limit check threw, allowing request:", err);
    return { ok: true };
  }
}
