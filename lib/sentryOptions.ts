import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, scrubSentryEvent } from "./sentryPrivacy";

/** Shared browser, Node and edge defaults. Keep all three runtimes identical. */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  const excludedIntegrations = new Set(["Replay", "BrowserTracing", "WebVitals"]);

  return {
    dsn,
    enabled: Boolean(dsn),
    // Browser bundles cannot read VERCEL_ENV. Give staging an explicit public
    // label and retain the platform values as server-side fallbacks.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim()
      || process.env.VERCEL_TARGET_ENV
      || process.env.VERCEL_ENV,
    sendDefaultPii: false,
    dataCollection: SENTRY_DATA_COLLECTION,
    enableLogs: false,
    enableMetrics: false,
    tracesSampleRate: 0,
    attachStacktrace: true,
    beforeSend: scrubSentryEvent,
    // Breadcrumbs frequently contain URLs, UI text or request metadata. The
    // error and its scrubbed stack are sufficient for this first release.
    beforeBreadcrumb: () => null,
    integrations: (defaults: ReturnType<typeof Sentry.getDefaultIntegrations>) =>
      defaults.filter(({ name }) => !excludedIntegrations.has(name)),
  };
}
