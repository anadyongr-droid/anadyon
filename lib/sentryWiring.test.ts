import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Sentry wiring", () => {
  it("covers browser, Node, edge and Next request failures", () => {
    expect(source("../instrumentation-client.ts")).toContain("Sentry.init(sentryOptions())");
    expect(source("../sentry.server.config.ts")).toContain("Sentry.init(sentryOptions())");
    expect(source("../sentry.edge.config.ts")).toContain("Sentry.init(sentryOptions())");
    expect(source("../instrumentation.ts")).toContain(
      "onRequestError = Sentry.captureRequestError",
    );
  });

  it("keeps replay, tracing, logs and metrics out of the deployment", () => {
    const options = source("./sentryOptions.ts");
    const config = source("../next.config.ts");
    expect(options).not.toContain("replayIntegration");
    expect(options).not.toContain("tracesSampleRate");
    expect(options).toContain("enableLogs: false");
    expect(options).toContain("enableMetrics: false");
    expect(config).toContain("bundleSizeOptimizations:");
    expect(config).toContain("excludeTracing: true");
  });

  it("does not require or upload source maps without a dedicated token", () => {
    const config = source("../next.config.ts");
    expect(config).toContain("disable: !sentryAuthToken");
    expect(config).toContain("deleteSourcemapsAfterUpload: true");
    expect(config).toContain("sentryAuthToken ? withSentryConfig");
  });

  it("uses the outbound allowlist and disables SDK data collection", () => {
    const options = source("./sentryOptions.ts");
    expect(options).toContain("dataCollection: SENTRY_DATA_COLLECTION");
    expect(options).toContain("beforeSend: scrubSentryEvent");
    expect(options).toContain("beforeBreadcrumb: () => null");
  });
});
