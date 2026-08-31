import type { ErrorEvent, StackFrame } from "@sentry/nextjs";

/**
 * Sentry v10 enables several request and runtime data sources by default.
 * Anadyon handles identity documents and booking data, so diagnostics are an
 * allowlist: useful failure shape may leave the process; customer data may not.
 */
export const SENTRY_DATA_COLLECTION = {
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
};

const ALLOWED_TAGS = new Set(["area", "operation", "runtime", "handled"]);
const SAFE_TAG_VALUE = /^[a-z0-9._:/-]{1,80}$/i;

function safeFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  return filename.split(/[?#]/, 1)[0];
}

function safeExceptionType(type: string | undefined): string | undefined {
  return type && /^[a-z0-9_.:$-]{1,100}$/i.test(type) ? type : "Error";
}

function scrubFrame(frame: StackFrame): StackFrame {
  return {
    filename: safeFilename(frame.filename),
    function: frame.function,
    module: frame.module,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    instruction_addr: frame.instruction_addr,
  };
}

/**
 * Final outbound privacy boundary. This deliberately reconstructs the event
 * instead of deleting known-sensitive fields: a new SDK field is therefore
 * private until it is explicitly reviewed and allowed.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(
      ([key, value]) =>
        ALLOWED_TAGS.has(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
        SAFE_TAG_VALUE.test(String(value)),
    ),
  );

  const exceptionValues = event.exception?.values?.map((exception) => ({
    type: safeExceptionType(exception.type),
    value: exception.value ? "[redacted]" : undefined,
    mechanism: exception.mechanism
      ? {
          type: exception.mechanism.type,
          handled: exception.mechanism.handled,
        }
      : undefined,
    stacktrace: exception.stacktrace
      ? { frames: exception.stacktrace.frames?.map(scrubFrame) }
      : undefined,
  }));

  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    sdk: event.sdk,
    message: event.message ? "[redacted]" : undefined,
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    exception: exceptionValues ? { values: exceptionValues } : undefined,
  };
}

/** Return the single Sentry ingest origin that the browser may contact. */
export function sentryIngestOriginFromDsn(dsn: string | undefined): string {
  const configured = dsn?.trim();
  if (!configured) return "";

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("Sentry DSN must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Sentry DSN must use HTTPS");
  }
  if (!/^o\d+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io$/i.test(parsed.hostname)) {
    throw new Error("Sentry DSN must use an official sentry.io ingest host");
  }

  return parsed.origin;
}
