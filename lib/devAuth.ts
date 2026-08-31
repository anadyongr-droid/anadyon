/**
 * Signing in to the admin area without Supabase — in a development container,
 * and nowhere else.
 *
 * ─── Why this exists ───
 *
 * An agent working in a development container cannot see an admin screen.
 * proxy.ts calls Supabase Auth on every /admin request, and a container with
 * no credentials never gets as far as the 8-second timeout: `createServerClient`
 * is handed an undefined NEXT_PUBLIC_SUPABASE_URL and throws, so /admin/fleet
 * answers 500. (Measured, not assumed — `next dev` with the switch unset.)
 *
 * So a UI question here has had two answers available: read the JSX, or render
 * fragments with page.setContent(), which starts no server and therefore has no
 * layout, no nav and no data flow around what it renders.
 *
 * The third answer — drive the real production admin while signed in — is what
 * finally settled the frozen-pane question on 31 August, and it is recorded in
 * docs/HANDOVER-ADMIN-FROZEN-PANES.md §"Fifth verification". It works, and it
 * is the wrong instrument for routine work: it needs credentials this container
 * does not hold, and every measurement is taken against live customer rows.
 *
 * This is the missing fourth: the real application, the real middleware, the
 * real layout, in a container that holds nothing.
 *
 * ─── What it does not give you, stated so nobody discovers it the hard way ───
 *
 * Rows. The admin screens are client components that fetch /api/admin/*, and
 * those routes still go to Supabase, which is still unreachable. What renders
 * is the shell, the navigation, the chrome and every empty state — measured:
 * /admin/fleet returns 200 and ~33KB of real page. What does not render is a
 * populated table, so this is not yet an instrument for a defect that needs
 * data to appear.
 *
 * Fixtures are deliberately a separate piece of work rather than an extra
 * commit here, because `AGENTS.md` is explicit that a reproduction must be able
 * to reproduce: a fixture whose shape has drifted from the route that really
 * serves it is a repro that cannot, and the guard against that drift is the
 * expensive half. Better absent than quietly wrong.
 *
 * ─── Why it is safe to have in the tree at all ───
 *
 * Because an auth bypass is exactly the kind of thing that is written for a
 * good reason and reached for a bad one, this is not one flag. Three
 * independent conditions must all hold, and no combination of two is enough:
 *
 *   1. `NODE_ENV === "development"`. `next build` sets it to "production", so
 *      in any deployed bundle this comparison is a compile-time constant and
 *      the branch is dead code — not merely unreached, but absent. Under
 *      vitest it is "test", which is why these tests stub it explicitly.
 *   2. `VERCEL` is unset. Vercel sets it in every environment, at build and at
 *      runtime, preview and production alike. This is the condition that
 *      survives someone setting NODE_ENV=development in project settings —
 *      the realistic way condition 1 gets defeated.
 *   3. `ANADYON_DEV_AUTH_ROLE` is exactly "admin" or "staff". No default, no
 *      truthiness, no case folding: an explicit statement of which chair you
 *      want to sit in. Deliberately not NEXT_PUBLIC_-prefixed, so it can never
 *      be inlined into a browser bundle.
 *
 * `AGENTS.md` is blunt about what a rule like this is worth: a check on a
 * string is a reminder to the code that wrote it, not a control on the
 * process. That is true here too. The reason this is nevertheless safe is the
 * same reason given there — **the boundary that holds is credentials and
 * environment separation**. This bypass grants a role header; it grants no
 * database access whatsoever. A container holding no Supabase credentials
 * still reaches no data, whatever proxy.ts decides about its role.
 */

/** The two roles proxy.ts recognises. Anything else is not a role. */
export type Role = "admin" | "staff";

/**
 * Just the variables that matter, read one by one rather than handed the whole
 * `process.env`.
 *
 * That shape is deliberate. Next.js statically replaces direct
 * `process.env.NODE_ENV` reads at build time; passing the environment object
 * around instead would turn the replacement off and leave the branch live in a
 * production bundle. So the caller reads each name literally, and this
 * function only decides.
 */
export interface DevAuthEnv {
  nodeEnv: string | undefined;
  vercel: string | undefined;
  role: string | undefined;
}

/**
 * The role this request runs as, or null — which means "use the real thing".
 *
 * Null is the answer to every question except the one narrow case, including
 * every malformed attempt to ask for it. There is no path here that resolves
 * upward on doubt.
 */
export function devAuthRole(env: DevAuthEnv): Role | null {
  if (env.nodeEnv !== "development") return null;
  if (env.vercel !== undefined && env.vercel !== "") return null;
  if (env.role === "admin" || env.role === "staff") return env.role;
  return null;
}

/**
 * The same decision, taken from the live environment.
 *
 * Kept next to the pure function rather than inlined at the call site so that
 * the literal `process.env.NODE_ENV` read — the one Next.js replaces — lives
 * in exactly one place and can be pointed at.
 */
export function devAuthRoleFromEnv(): Role | null {
  return devAuthRole({
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    role: process.env.ANADYON_DEV_AUTH_ROLE,
  });
}

/**
 * What is printed on every request the bypass serves.
 *
 * Loud on purpose, and not once-per-process: a bypass that announces itself
 * only at boot is a bypass you forget is on. The one thing worse than not
 * having this is having it and not noticing.
 */
export function devAuthWarning(role: Role, pathname: string): string {
  return `[proxy] DEVELOPMENT AUTH BYPASS active as "${role}" for ${pathname} — ` +
    `no Supabase session was checked. Unset ANADYON_DEV_AUTH_ROLE to turn this off.`;
}
