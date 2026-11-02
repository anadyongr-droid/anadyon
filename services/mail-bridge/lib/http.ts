/**
 * The HTTP binding around the handlers — routing, headers, body limits and
 * CORS — kept framework-agnostic for the same reason the handlers are: the
 * decisions below are testable without a server, and a Vercel, Express or
 * Workers adapter should hold no discretion at all.
 *
 * **What belongs here and what does not.** This file decides *whether a
 * request is well-formed enough to be a request*. It decides nothing about
 * whether a message may be sent — that is `relay.ts`, and it runs after every
 * check here has passed. The split matters because a transport that quietly
 * repaired a malformed request would be making a security decision in the
 * layer with no tests for one.
 *
 * **The CORS position.** An extension calling from `https://mail.google.com`
 * sends an `Origin`, so this is a real browser check and not decoration. There
 * is no wildcard: a request carrying an origin that is not allowlisted is
 * refused outright rather than answered without the header, because a refusal
 * is visible in a log and a missing header looks like a bug in the extension.
 * `Access-Control-Allow-Credentials` is never set — the relay authenticates
 * with a bearer token the extension holds, so cookies have no part in it, and
 * allowing credentials would make every other origin's cookie jar relevant.
 *
 * **Why the body cap is here *and* has a note about not being enough.** By the
 * time a handler is called the body is already a string in memory, so a cap
 * applied here cannot protect against the read that produced it. It is a
 * second line, and `MAX_BODY_BYTES` is documented so an adapter sets the same
 * number at the socket where it actually helps.
 */

import { handleListSenders, handleSend, handleStatus, type RelayDeps, type RelayResponse } from "./relay";

/** 10 MB: comfortably above a reply with no attachments, far below a heap. */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export type HttpRequest = {
  readonly method: string;
  /** Path only, no query string. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  /** The raw body, already read. Empty string for a GET. */
  readonly body: string;
};

export type HttpResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Record<string, unknown>;
};

export type TransportOptions = {
  /**
   * Exact origins permitted to call, e.g. `chrome-extension://<id>`. Empty
   * means no cross-origin caller is permitted at all, which is the right
   * default before an extension id exists.
   */
  readonly allowedOrigins: readonly string[];
};

/** Case-insensitive header read: Node lowercases, others do not. */
function header(req: HttpRequest, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/**
 * `Authorization: Bearer <token>`, and nothing else accepted. A token in a
 * query string would reach access logs and browser history, so a `?token=`
 * fallback is deliberately absent.
 */
export function bearerToken(req: HttpRequest): string | undefined {
  const raw = header(req, "authorization");
  if (!raw) return undefined;
  const match = /^Bearer ([^\s]+)$/.exec(raw.trim());
  return match ? match[1] : undefined;
}

const SECURITY_HEADERS: Record<string, string> = {
  // Nothing here is a document, so nothing here should ever be treated as one.
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function corsHeaders(origin: string | undefined, options: TransportOptions): Record<string, string> {
  if (!origin || !options.allowedOrigins.includes(origin)) return {};
  return {
    // Echoed, never `*`, and only after an exact allowlist match.
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

const respond = (
  status: number,
  body: Record<string, unknown>,
  cors: Record<string, string>,
): HttpResponse => ({ status, headers: { ...SECURITY_HEADERS, ...cors }, body });

export async function handleHttp(
  req: HttpRequest,
  deps: RelayDeps,
  options: TransportOptions,
): Promise<HttpResponse> {
  const origin = header(req, "origin");
  const cors = corsHeaders(origin, options);

  // An origin we do not know is refused before anything else is looked at,
  // including the method — so a preflight from a stranger learns nothing about
  // which methods exist.
  if (origin && Object.keys(cors).length === 0) {
    return respond(403, { error: "Origin not permitted." }, {});
  }

  if (req.method === "OPTIONS") {
    // Preflight. 204 would be more correct with no body; a body is kept so
    // every response from this transport has the same shape to assert on.
    return respond(204, {}, cors);
  }

  const path = req.path.replace(/\/+$/, "") || "/";

  if (path === "/senders") {
    if (req.method !== "GET") return respond(405, { error: "Method not allowed." }, cors);
    const result = await handleListSenders(bearerToken(req), deps);
    return respond(result.status, result.body, cors);
  }

  if (path === "/status") {
    if (req.method !== "GET") return respond(405, { error: "Method not allowed." }, cors);
    const key = req.query.idempotencyKey;
    if (!key) return respond(400, { error: "An idempotencyKey is required." }, cors);
    const result = await handleStatus(bearerToken(req), key, deps);
    return respond(result.status, result.body, cors);
  }

  if (path === "/send") {
    if (req.method !== "POST") return respond(405, { error: "Method not allowed." }, cors);

    const contentType = header(req, "content-type") ?? "";
    // A form-encoded post from a page is how a CSRF attempt arrives; JSON is
    // not a simple request type, so requiring it is a control and not taste.
    if (!/^application\/json\b/i.test(contentType.trim())) {
      return respond(415, { error: "Content-Type must be application/json." }, cors);
    }

    const size = byteLength(req.body);
    if (size > MAX_BODY_BYTES) {
      return respond(413, { error: "The request is too large." }, cors);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body);
    } catch {
      // The parser's message quotes the input, so it is never passed on.
      return respond(400, { error: "The request body is not valid JSON." }, cors);
    }
    // An array, a string and null all parse, and none of them is a request.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return respond(400, { error: "The request body must be a JSON object." }, cors);
    }

    const result: RelayResponse = await handleSend(bearerToken(req), parsed, deps);
    return respond(result.status, result.body, cors);
  }

  return respond(404, { error: "No such endpoint." }, cors);
}

/** UTF-8 length, so a body of multi-byte characters is measured honestly. */
export function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, "utf8");
}
