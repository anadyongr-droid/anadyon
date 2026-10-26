/**
 * What `supabase/seeds/staging.sql` must produce, in one place.
 *
 * **Why this is a module rather than two inline comparisons.** The synthetic
 * seed is verified twice — once by `check-migration-replay.mjs`, which applies
 * it to PGlite in CI with no credentials, and once by `reset-staging.mjs` after
 * a hosted reset. Both counted the same three fixtures and both omitted the
 * same two tables, which is what a duplicated expectation does: it drifts in
 * step and nobody notices, because the two copies agree with each other rather
 * than with the seed.
 *
 * **Why `rates` and `extras_config` matter more than the rest of the list.**
 * They are the two tables `DEFINING-STATEMENTS.md` §6 deliberately grants to
 * `anon`, and the reason it gives is that *"the public booking form cannot
 * price a rental without them"*. So a seed that loaded no rates leaves staging
 * able to show vehicles and unable to quote for any of them — and until this
 * module existed, the reset would have reported success: it counted 29
 * vehicles, 5 customers, 6 reservations, found the bucket, and never asked
 * whether a price could be produced.
 *
 * That is the shape of defect this project keeps finding — a control that is
 * green while the thing it exists to protect is broken — and it is why the
 * counts live beside a function that names what is wrong rather than returning
 * a boolean.
 */

/**
 * The fixture counts the seed produces. `openDamages` is a floor rather than an
 * equality because the seed guarantees at least one unrepaired damage and the
 * exact number is not something a caller should depend on.
 */
export const STAGING_SEED_EXPECTATIONS = Object.freeze({
  vehicles: 29,
  customers: 5,
  reservations: 6,
  rates: 18,
  extras: 5,
  openDamagesAtLeast: 1,
});

/**
 * Names every fixture count that is wrong, rather than returning a boolean.
 *
 * A reset is read on a terminal by someone who then has to decide whether to
 * run it again, so "expected 18 rates, found 0" is the difference between a
 * diagnosis and a shrug.
 *
 * @param {{vehicles:number, customers:number, reservations:number, rates:number,
 *          extras:number, openDamages?:number, bucket:boolean}} counts
 * @returns {string[]} empty when the state is as expected
 */
export function stagingSeedProblems(counts) {
  const e = STAGING_SEED_EXPECTATIONS;
  const problems = [];
  const exact = [
    ["vehicles", e.vehicles],
    ["customers", e.customers],
    ["reservations", e.reservations],
    ["rates", e.rates],
    ["extras", e.extras],
  ];
  for (const [key, expected] of exact) {
    const got = counts[key];
    if (got !== expected) problems.push(`expected ${expected} ${key}, found ${got ?? "none reported"}`);
  }
  if (counts.openDamages !== undefined && counts.openDamages < e.openDamagesAtLeast) {
    problems.push(`expected at least ${e.openDamagesAtLeast} open damage, found ${counts.openDamages}`);
  }
  if (!counts.bucket) problems.push("the private reservation-documents bucket is missing");
  return problems;
}

/**
 * One line for a terminal or a step summary, listing what was checked so a
 * reader can see that pricing was among it.
 */
export function stagingSeedSummary() {
  const e = STAGING_SEED_EXPECTATIONS;
  return (
    `${e.vehicles} vehicles, ${e.customers} customers, ${e.reservations} reservations, ` +
    `${e.rates} rates and ${e.extras} extras, an open damage and the private documents bucket`
  );
}
