import { NextRequest, NextResponse } from "next/server";

/**
 * Collects Content-Security-Policy violation reports.
 *
 * Two policies are served: the enforced one, and a stricter Report-Only one
 * that drops `'unsafe-inline'` from script-src. The Report-Only policy is not
 * enforced, so nothing breaks — it exists to answer, from real traffic, the
 * question that decides whether the strict policy can be turned on: what would
 * actually have been blocked?
 *
 * Reports are deduplicated in memory and logged, rather than stored. A CSP
 * report is attacker-influenceable (anyone can POST one), so it is treated as a
 * signal to look into, never as data to trust or to persist against a user.
 */

/** Directive+blocked-URI pairs already logged, so one broken asset on a busy
 *  page does not produce a line per visitor. Per-instance and deliberately
 *  unbounded-but-capped; it is a noise filter, not a store. */
const seen = new Set<string>();
const MAX_SEEN = 500;

interface Report {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "script-sample"?: string;
  disposition?: string;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // A malformed report is not worth an error response; the browser will not
    // act on it either way.
    return new NextResponse(null, { status: 204 });
  }

  // Browsers send either {"csp-report": {…}} (Level 2) or an array of
  // {type, body} (Reporting API). Both shapes are flattened here.
  const raw = body as Record<string, unknown>;
  const reports: Report[] = Array.isArray(body)
    ? (body as { body?: Report }[]).map((r) => r.body ?? {})
    : [(raw["csp-report"] as Report) ?? (raw as Report)];

  for (const r of reports) {
    const directive = r["effective-directive"] ?? r["violated-directive"] ?? "unknown";
    const blocked = (r["blocked-uri"] ?? "unknown").slice(0, 200);
    const key = `${directive}|${blocked}`;
    if (seen.has(key)) continue;
    if (seen.size >= MAX_SEEN) seen.clear();
    seen.add(key);

    console.warn("[csp]", JSON.stringify({
      disposition: r.disposition ?? "report",
      directive,
      blocked,
      page: (r["document-uri"] ?? "").slice(0, 200),
      sample: (r["script-sample"] ?? "").slice(0, 120),
    }));
  }

  return new NextResponse(null, { status: 204 });
}
