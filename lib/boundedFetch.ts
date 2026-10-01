/**
 * One place that bounds an outbound call, and one test that proves nobody forgot.
 *
 * **W27, the widest finding of the §5.3 audit.** Blueprint §5.3 states the rule
 * as universal:
 *
 * > *every external call carries a timeout*
 *
 * It was honoured in four files. The August 2026 admin outage *was* an unbounded
 * call on a slow day, and the fix was applied to that one call rather than to the
 * rule it was an instance of — which is the same shape of failure §5.3 exists to
 * name, one level up.
 *
 * So the deliverable here is deliberately not "add a timeout to nine callers".
 * It is a helper plus **`lib/boundedFetch.test.ts`, which walks every
 * server-side `fetch(` in the repository and fails naming any that is
 * unbounded.** Nine callers is a morning's work; the rule staying true in six
 * months is the thing that was actually missing. A tenth caller added next month
 * cannot quietly reopen this.
 *
 * ## Why a timeout and not a retry
 *
 * Abandoning a slow call is not the same as deciding what to do next, and this
 * module deliberately does only the first. §5.3's three rules differ per caller:
 * a scrape that times out is a skipped source, a Telegram alert is queued to
 * `alert_outbox`, and an AADE submission that times out is *ambiguous* — the
 * filing may have been accepted with the answer lost. One helper cannot decide
 * that, so it throws and each caller keeps its own answer.
 *
 * ## What the audit got wrong, corrected here
 *
 * The audit listed **Resend** as unbounded. It is not: `lib/mailer.ts` has raced
 * every send against an 8s timer since the queued-mail work, and the §5.3a row
 * for Resend was right to read "built". Verified by reading `attempt()`, per
 * `DEFINING-STATEMENTS.md` §8 — the audit's own list was the unverified claim.
 *
 * ## Why the four existing callers were left alone
 *
 * `healthChecks.ts`, `telegram.ts`, `recaptcha.ts` and `mailer.ts` each bound
 * their calls already, in a shape fitted to what they do next — `withTimeout`
 * passing a signal into a closure, a reason string for the outbox, a
 * `Promise.race` around an SDK that takes no signal. Rewriting working code to
 * route through this module would be churn with a regression risk and no gain,
 * so the test below accepts any of those shapes as bounded. What it does not
 * accept is a bare `fetch`.
 */

/** Thrown when a call is abandoned. Named so a caller can tell it apart. */
export class ExternalCallTimeout extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} did not answer within ${timeoutMs}ms`);
    this.name = "ExternalCallTimeout";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The budgets, named and reasoned once rather than argued per call site.
 *
 * The ceiling on all of them is Vercel's function `maxDuration`: a timeout
 * longer than the platform's own is not a timeout, it is a comment. These are
 * chosen to leave room for the database write that follows the call, because a
 * call that is abandoned and then not *recorded* as abandoned is the silent
 * failure over again.
 */
export const TIMEOUTS = {
  /**
   * A vendor API answering from its own database. Apify's control plane and a
   * currency feed both sit here; `lib/mailer.ts` and `lib/healthChecks.ts`
   * independently chose the same 8s, which is the figure the August outage
   * produced.
   */
  api: 8_000,

  /**
   * Fetching a dataset, which is a body of unknown size rather than a status.
   * Apify's items endpoint returns every vehicle from every search in one
   * response; 8s is the budget for an answer, not for a download.
   */
  dataset: 30_000,

  /**
   * Scraping a competitor's page. Slower on purpose: these are WordPress sites
   * on shared hosting, a slow answer is normal rather than a fault, and nothing
   * waits on the result — collection runs from the admin screen and reports per
   * source.
   */
  scrape: 20_000,

  /**
   * A filing to AADE. The most generous budget here because the government
   * endpoint is the slowest thing this system talks to and an abandoned filing
   * is the most expensive thing to get wrong — but still finite, because a
   * statutory submission held open until the platform kills the function tells
   * the operator nothing at all.
   */
  filing: 25_000,
} as const;

/**
 * `fetch`, abandoned on a budget, failing with a sentence that says which call.
 *
 * The label is not decoration. An unbounded call shows up in production as a
 * function that was killed by the platform, and the question is always *which*
 * outbound call hung — so the error names it rather than leaving a bare
 * `TimeoutError` from the runtime.
 *
 * A caller's own `signal` is honoured alongside the budget, so this composes
 * with an outer abort rather than replacing it.
 */
export async function boundedFetch(
  label: string,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.api,
): Promise<Response> {
  const budget = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, budget]) : budget;

  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    // Distinguished by *which* signal fired: a caller's own abort is theirs to
    // describe, and reporting it as our timeout would send someone looking for a
    // slow vendor that was never involved.
    if (budget.aborted) throw new ExternalCallTimeout(label, timeoutMs);
    throw err;
  }
}

/**
 * A route-wide budget, because a per-call timeout is not enough on its own.
 *
 * **Found by the review bot on #190**, and it was right. `TIMEOUTS.scrape` was
 * chosen as 20s against Vercel's 60s `maxDuration` — safe for one call, and
 * unsafe for the route that makes several. `app/api/admin/competitors/scrape`
 * runs four EzCar searches with three *mandatory* 10-second crawl delays
 * between them: 30 seconds of the 60 are already spent sleeping, so two slow
 * calls alone (20 + 20) exceed the ceiling. The final batch adds three
 * Podilatadiko pages and the scooter tariff on top.
 *
 * The consequence is worse than a slow source. The platform kills the
 * invocation **before the cursor is written**, so the batch's progress is lost
 * and the next call redoes it — a timeout that produces no degraded state at
 * all, which is precisely what §5.3 forbids.
 *
 * Shrinking the per-call figure cannot fix this, and that is the point worth
 * recording: the call count is variable (four on most batches, eight on the
 * last), so any constant small enough for the worst case is needlessly short
 * for the common one. The budget has to be shared and drawn down.
 *
 * `reserveMs` is what the route still needs *after* its last call — writing the
 * cursor, recording the import, building the response. A call allowed to run to
 * the ceiling leaves nothing for the write that records what happened, which is
 * the same silent failure one level in.
 */
export function routeBudget(
  ceilingMs: number,
  opts: { reserveMs?: number; now?: () => number } = {},
): {
  /** Milliseconds left for calls, never negative. */
  remaining(): number;
  /** The budget for one call: the smaller of what it wants and what is left. */
  forCall(preferredMs: number): number;
  /** Whether there is enough left to be worth starting another call. */
  canAfford(minimumMs: number): boolean;
} {
  const now = opts.now ?? (() => Date.now());
  const reserve = opts.reserveMs ?? 3_000;
  const started = now();

  const remaining = () => Math.max(0, ceilingMs - reserve - (now() - started));

  return {
    remaining,
    forCall: (preferredMs: number) => Math.min(preferredMs, remaining()),
    // A call given a millisecond or two is a call that fails slowly instead of
    // being skipped honestly, so the caller asks before starting one.
    canAfford: (minimumMs: number) => remaining() >= minimumMs,
  };
}
