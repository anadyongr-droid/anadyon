import NotFoundContent from "./components/NotFoundContent";

/**
 * Handles every unmatched URL on the site, in both languages.
 *
 * Next routes all of them here — `app/not-found` is the whole application's
 * fallback, not just this segment's — and renders it inside the root layout, so
 * the header, the language toggle and the footer come with it. That is why this
 * file can stay this small and why `global-not-found` is not used: the
 * experimental variant bypasses the layout, and losing the navigation is the
 * opposite of what a 404 needs.
 *
 * No `metadata` export. Next supports one only for `global-not-found.js`, so
 * this page inherits the root layout's `robots: index, follow` and its
 * canonical pointing at the homepage. Untidy, and checked rather than waved
 * through: the live 404 really does carry both that `index, follow` and the
 * `noindex` Next injects for any page served with a 404 status. Google's
 * documentation settles which wins — "In the case of conflicting robots rules,
 * the more restrictive rule applies" — so `noindex` does, and an unindexed page
 * has no use for a canonical. Left alone deliberately; the alternative is the
 * experimental `global-not-found`, which costs the layout.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
