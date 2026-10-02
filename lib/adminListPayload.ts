/**
 * Reading a list response on an admin screen, without mistaking a fault for an
 * empty day.
 *
 * **W23, from the §5.3 audit.** `app/admin/reservations/page.tsx` fetched its
 * rows, called `.json()` on whatever came back, and swallowed every failure in
 * a `.catch` that did nothing. So a database outage left `reservations` as `[]`
 * and the table rendered a confident **"No reservations found."** That is this
 * row's own sentence failing on the busiest screen in the admin:
 *
 * > *"no reservations today" and "we cannot reach the database" must never look
 * > alike.*
 *
 * Two distinct faults were being treated as success, and both are checked here
 * rather than at the call site, so the next screen to need this does not have to
 * remember them:
 *
 * - **A non-2xx response.** `res.ok` was never consulted, so a 500 whose body is
 *   `{ "error": … }` was assigned straight into the rows state.
 * - **A body that is not a list.** Even on a 200, an error object or a `null`
 *   would be assigned where an array is expected — rendering an empty table, or
 *   throwing on `.map` and taking the screen down with it.
 */

export type ListResult<T> =
  | { rows: T[]; error: null }
  | { rows: null; error: string };

/**
 * Validates one list response.
 *
 * The message is written for the person reading it beside an empty table, so it
 * says what the server did rather than naming a status code and leaving them to
 * infer the consequence.
 */
export function readListPayload<T>(
  res: { ok: boolean; status: number },
  body: unknown
): ListResult<T> {
  if (!res.ok) {
    return { rows: null, error: `the server answered ${res.status}` };
  }
  if (!Array.isArray(body)) {
    // Reached on a 200 whose body is an error object, a null, or a bare
    // message. Rare, and precisely the case that renders as "nothing here".
    return { rows: null, error: "the server did not return a list" };
  }
  return { rows: body as T[], error: null };
}

/**
 * Combines several list responses, failing on the first that is unusable.
 *
 * A screen that loads two lists together is only as loaded as its worst
 * response: showing reservations with an empty vehicle list would misreport
 * every row's vehicle as missing. So one failure fails the load, and the
 * message names which call it was.
 */
export function readListPayloads(
  parts: { name: string; res: { ok: boolean; status: number }; body: unknown }[]
): { error: string | null } {
  for (const part of parts) {
    const result = readListPayload(part.res, part.body);
    if (result.error) return { error: `${part.name}: ${result.error}` };
  }
  return { error: null };
}
