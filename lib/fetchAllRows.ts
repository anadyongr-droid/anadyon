/**
 * Read every row of a query, not the first thousand of them.
 *
 * PostgREST caps an unbounded select. Supabase ships that cap at 1,000 rows, and
 * it is applied silently: the request succeeds, `error` is null, and the caller
 * receives a truncated page that looks exactly like a complete one. Nothing in
 * the response distinguishes "these are all the rows" from "these are the first
 * thousand of nine thousand".
 *
 * That is the dangerous shape of this bug. A competitor comparison computed over
 * an arbitrary 1,000-row slice does not fail — it quietly reports averages, and
 * minimum and maximum prices, drawn from part of the data, and reports them with
 * the same confidence as the truth.
 *
 * ORDERING IS NOT OPTIONAL. Paginating with `.range()` over an unordered query
 * is undefined: PostgreSQL may return rows in a different physical order between
 * pages, so a row can be delivered twice and another skipped. Every caller
 * orders by a stable unique key — for `competitor_rates` that is the `id`
 * primary key. This is why the helper takes a page-builder rather than a table
 * name: the caller cannot forget the ordering without writing it out.
 */

/** Supabase's default `max-rows`. Asking for more per page is simply ignored. */
export const PAGE_SIZE = 1000;

/**
 * 50 pages — 50,000 rows — then stop and say so.
 *
 * A bound exists so a mistake in the page builder (an ordering that never
 * advances, say) cannot loop forever against the database. It is deliberately
 * far above any plausible size of these tables, so reaching it means something
 * is wrong rather than that the data grew.
 */
export const MAX_PAGES = 50;

export interface PagedResult<T> {
  rows: T[];
  /**
   * True when the rows are known to be incomplete — the page ceiling was hit, or
   * a page failed partway through. Never silently false in either case: a caller
   * that shows numbers to a person needs to be able to say they are partial.
   */
  truncated: boolean;
  error: string | null;
}

interface PageResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * @param page builds one page of the query. Must apply a stable `.order(...)`
 *             and the supplied `.range(from, to)`.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  options: { pageSize?: number; maxPages?: number } = {}
): Promise<PagedResult<T>> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const rows: T[] = [];

  for (let i = 0; i < maxPages; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);

    // A failure partway through leaves real rows in hand. They are returned
    // rather than discarded, but flagged, so a caller can show what it has
    // without implying it is everything.
    if (error) return { rows, truncated: true, error: error.message };

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the end of the data. A page that comes back exactly full
    // is ambiguous — it may or may not be the last — so the loop asks once more
    // and that request returns empty. One extra round trip is the cost of not
    // guessing.
    if (batch.length < pageSize) return { rows, truncated: false, error: null };
  }

  return { rows, truncated: true, error: null };
}
