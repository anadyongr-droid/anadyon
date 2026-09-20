/**
 * Turning what the counter's database functions raise into an HTTP answer.
 *
 * Migrations 041–043 raise with deliberate SQLSTATEs rather than one generic
 * error, because the caller is a tablet held by somebody standing next to a car
 * and the difference between "you may not do this", "that is not there" and
 * "here are the four things still missing" is the difference between a usable
 * screen and a shrug.
 *
 * Kept in one file, with its own tests, because the alternative is five routes
 * each mapping the same codes slightly differently — and the one that gets it
 * wrong will be the one nobody exercises.
 */

/** The codes the counter's functions raise, and what each means to a caller. */
export const HANDOVER_ERROR_STATUS: Record<string, number> = {
  // No actor could be established. From the implementations this means the
  // route failed to resolve a session; from the gateways it means auth.uid()
  // was null.
  AN401: 401,
  // A real caller who may not do this — correcting a completed handover
  // without being an administrator.
  AN403: 403,
  AN404: 404,
  // A state conflict: a voided handover, a check-in submitted down the
  // check-out path. Retrying without changing something will not help.
  AN409: 409,
  // The preconditions were not met. The message carries every reason, which is
  // the point of collecting them.
  AN422: 422,
};

/**
 * Postgres codes that can surface from the tables underneath, kept distinct
 * from the ones the functions raise deliberately.
 *
 * 23505 is the partial unique index refusing a second live handover for a
 * reservation and direction — a conflict, not a server fault, and the caller
 * can act on it.
 */
const PG_STATUS: Record<string, number> = {
  "23505": 409, // unique violation
  "23503": 400, // foreign key violation
  "23514": 400, // check constraint violation
  "22P02": 400, // invalid text representation, e.g. a malformed uuid
};

export interface PostgresLikeError {
  code?: string | null;
  message?: string | null;
}

/** The HTTP status for an error from a handover RPC or table write. */
export function handoverErrorStatus(error: PostgresLikeError | null | undefined): number {
  const code = error?.code ?? "";
  return HANDOVER_ERROR_STATUS[code] ?? PG_STATUS[code] ?? 500;
}

/**
 * What the person holding the tablet should read.
 *
 * The refusals are written to be read by staff — "check-out refused: the
 * rental agreement is not recorded as signed; 2 required photograph(s) are
 * missing" — so they are passed through unchanged, minus the prefix the
 * function used to name itself.
 *
 * **Anything unrecognised is not passed through.** A 500 from Postgres can
 * carry a column list, a constraint name or a fragment of a query, and none of
 * that belongs on a screen at a rental counter. This is the same reasoning as
 * the proxy logging timings and labels but never a token.
 */
export function handoverErrorMessage(error: PostgresLikeError | null | undefined): string {
  const code = error?.code ?? "";
  const raw = (error?.message ?? "").trim();

  if (code in HANDOVER_ERROR_STATUS && raw) {
    return raw.replace(/^(check-out|check-in|correction) refused:\s*/i, "");
  }

  if (code === "23505") {
    return "There is already a live handover for this rental and direction.";
  }

  return "Something went wrong saving this. Nothing was changed.";
}
