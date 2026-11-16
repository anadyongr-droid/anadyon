import { timingSafeEqual } from "node:crypto";

/** Reject all callers if no nonblank scheduler secret is configured. */
export function isAuthorisedCron(header: string | null, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret?.trim()) return false;
  // Whitespace is checked for emptiness, but is never silently removed from
  // an existing credential: comparison preserves the configured bytes.
  const expected = Buffer.from(`Bearer ${secret}`);
  const presented = Buffer.from(header ?? "");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
