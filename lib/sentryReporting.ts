import * as Sentry from "@sentry/nextjs";

type ErrorArea = "aade" | "invoice" | "proxy" | "quote";

/** Report a handled operational failure without attaching bodies or identity. */
export function reportHandledError(
  error: unknown,
  area: ErrorArea,
  operation: string,
): string {
  const safeOperation = operation
    .replace(/[^a-z0-9._:/-]/gi, "-")
    .slice(0, 80) || "unknown";
  return Sentry.captureException(error instanceof Error ? error : new Error("Handled failure"), {
    tags: { area, operation: safeOperation, handled: "true" },
  });
}

/** Give short-lived runtimes a bounded chance to transmit a captured error. */
export function flushSentryEvents(timeoutMs = 1_500): Promise<boolean> {
  return Sentry.flush(timeoutMs);
}
