import { type NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/healthChecks";

const ROLE_HEADER = "x-anadyon-role";

/** Six checks, each bounded at 8s and run in parallel. 60s is ample. */
export const maxDuration = 60;

/**
 * Somewhere to look, rather than only something that tells you.
 *
 * `lib/healthChecks.ts` has run daily since it was written, and every result
 * it produced went out through `sendTelegram` and nowhere else. On 21
 * September that channel turned out never to have worked, so the backup gap
 * had two independent detectors — the workflow's own alert and
 * `checkBackupFreshness` — and both were mute. Push-only monitoring fails
 * closed and silent, and its failure mode is indistinguishable from
 * everything being fine.
 *
 * The checks run **live** on each request rather than returning a stored
 * snapshot. That is deliberate and it is also what makes this shippable
 * today: a stored history needs a table, agents on this project do not apply
 * migrations, and the surface would then be inert until someone did. It also
 * answers a better question — "is anything wrong now?" rather than "was
 * anything wrong when the cron last ran?" — and `healthChecks.ts` is built for
 * it, asking production directly rather than reading local configuration.
 *
 * `proxy.ts` enforces the session and MFA gates; the role check is defence in
 * depth so a direct invocation cannot become public.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get(ROLE_HEADER) !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks = await runHealthChecks();

  return NextResponse.json(
    {
      ranAt: new Date().toISOString(),
      failing: checks.filter((c) => !c.ok).length,
      checks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
