/**
 * Path and filename rules for reservation documents.
 *
 * Every object in the bucket lives under `<reservation uuid>/`, and every route
 * that names a path must prove the path belongs to a reservation that exists.
 * Without that, `?path=` is an instruction the caller writes and the server
 * obeys: the download route would issue a signed URL for any object anyone
 * could name, and the delete route would remove it.
 *
 * A staff session is not a low-value credential here — these are customers'
 * driving licences and identity documents.
 */

/** Canonical Postgres UUID shape. Anything else is not a reservation id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReservationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Reduces a client-supplied filename to something safe to store.
 *
 * Strips directory separators and traversal outright rather than trying to
 * detect them: a name is a name, and any path structure in it is either a
 * mistake or an attempt. Keeps a recognisable extension so staff can tell a
 * licence photo from a PDF in the list.
 */
export function safeFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const base = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")   // keep letters, digits, underscore, dot, dash, space
    .replace(/\.{2,}/g, ".")      // no ".." however it was spelled
    .replace(/^\.+/, "")          // no leading dot: not a hidden file
    .trim()
    .slice(0, 120);

  if (!cleaned || cleaned === "." ) return null;
  return cleaned;
}

/** The MIME types the bucket itself also enforces, kept in step deliberately. */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
] as const;

export function isAllowedMime(value: unknown): boolean {
  return typeof value === "string" && (ALLOWED_MIME as readonly string[]).includes(value);
}

/**
 * Splits a storage path and refuses anything that is not exactly
 * `<uuid>/<filename>`.
 *
 * Returns null rather than throwing, so callers answer 400 instead of leaking
 * whether a given object exists.
 */
export function parseDocumentPath(path: unknown): { reservationId: string; fileName: string } | null {
  if (typeof path !== "string") return null;
  if (path.includes("..") || path.startsWith("/")) return null;

  const parts = path.split("/");
  if (parts.length !== 2) return null;

  const [reservationId, fileName] = parts;
  if (!isReservationId(reservationId)) return null;
  if (!fileName || fileName !== safeFileName(fileName)) return null;

  return { reservationId, fileName };
}
