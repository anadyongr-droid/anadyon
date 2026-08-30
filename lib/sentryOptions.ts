import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from "./sentryPrivacy";

/** Shared browser, Node and edge defaults. Keep all three runtimes identical. */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  return {
    dsn,
    enabled: Boolean(dsn),
    // On the server VERCEL_ENV distinguishes preview from production. In the
    // browser leaving this undefined lets Sentry's Next integration use its
    // public Vercel environment detection instead of collapsing both to
    // NODE_ENV=production.
    environment: process.env.VERCEL_ENV,
    sendDefaultPii: false,
    dataCollection: SENTRY_DATA_COLLECTION,
    enableLogs: false,
    enableMetrics: false,
    attachStacktrace: true,
    beforeSend: scrubSentryEvent,
    // Breadcrumbs frequently contain URLs, UI text or request metadata. The
    // error and its scrubbed stack are sufficient for this first release.
    beforeBreadcrumb: () => null,
    integrations: (defaults: ReturnType<typeof Sentry.getDefaultIntegrations>) =>
      defaults.filter(({ name }) => name !== "Replay"),
  };
}
