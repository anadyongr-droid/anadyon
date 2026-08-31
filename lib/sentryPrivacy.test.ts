import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  SENTRY_DATA_COLLECTION,
  scrubSentryEvent,
  sentryIngestOriginFromDsn,
} from "./sentryPrivacy";

describe("Sentry privacy boundary", () => {
  it("removes representative customer identity data from every event surface", () => {
    const passport = "PA1234567";
    const email = "customer@example.com";
    const cookie = "sb-access-token=secret-session";
    const event: ErrorEvent = {
      type: undefined,
      message: `Booking failed for ${email} passport ${passport}`,
      transaction: `/admin/customers?email=${email}`,
      server_name: email,
      tags: { customer: email, area: "quote" },
      user: { id: passport, email },
      request: {
        url: `https://anadyon.gr/api/quote?passport=${passport}`,
        headers: { cookie },
        cookies: { session: cookie },
        data: { email, passport_number: passport },
      },
      breadcrumbs: [{ message: email, data: { passport } }],
      contexts: { customer: { email, passport } },
      extra: { submittedBody: { email, passport } },
      debug_meta: {
        images: [{ code_file: `https://example.invalid/${passport}` } as never],
      },
      exception: {
        values: [{
          type: "BookingError",
          value: `${email}: ${passport}`,
          stacktrace: {
            frames: [{
              filename: "app/api/quote/route.ts?customer=" + email,
              abs_path: `/private/${passport}/route.ts`,
              function: "POST",
              lineno: 42,
              colno: 7,
              context_line: passport,
              pre_context: [email],
              post_context: [cookie],
              vars: { passport },
            }],
          },
        }],
      },
    };

    const scrubbed = scrubSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);

    for (const secret of [passport, email, cookie]) {
      expect(serialized).not.toContain(secret);
    }
    expect(scrubbed.exception?.values?.[0].type).toBe("BookingError");
    expect(scrubbed.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: "app/api/quote/route.ts",
      function: "POST",
      lineno: 42,
      colno: 7,
    });
    expect(scrubbed.tags).toEqual({ area: "quote" });
  });

  it("opts out of every SDK data-collection category", () => {
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    });
  });

  it("allows only an exact HTTPS sentry.io ingest origin into CSP", () => {
    expect(
      sentryIngestOriginFromDsn("https://public@o123.ingest.de.sentry.io/456")
    ).toBe("https://o123.ingest.de.sentry.io");
    expect(sentryIngestOriginFromDsn(undefined)).toBe("");
    expect(() => sentryIngestOriginFromDsn("http://o123.ingest.sentry.io/456"))
      .toThrow(/HTTPS/);
    expect(() => sentryIngestOriginFromDsn("https://public@attacker.example/456"))
      .toThrow(/sentry\.io/);
  });
});
