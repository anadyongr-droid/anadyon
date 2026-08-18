/**
 * Sets the document language for every Greek route.
 *
 * Only the root layout renders `<html>`, and it is shared by both languages, so
 * a Greek page was declaring `lang="en"` — which makes a screen reader read
 * Greek with English phonemes and tells search engines the page is English.
 *
 * The obvious fix, reading the request path in the root layout, was tried and
 * reverted: calling `headers()` there opts every route in the application out
 * of static generation, turning the whole site from CDN-served HTML into a
 * function invocation per page view. Fixing one attribute is not worth that.
 *
 * The alternative — two root layouts under route groups — is the pattern Next
 * documents, but it means relocating all 27 public page directories, which is
 * not a change to make days before a launch. It remains the right end state.
 *
 * So the attribute is corrected by a script that runs during HTML parse, before
 * anything is painted or announced. `hreflang` in the page metadata already
 * declares the language pair to search engines independently of this, and
 * Googlebot executes scripts, so the SEO signal does not rest on it alone.
 */
export default function GreekLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        // Parser-blocking and inline on purpose: it must run before first paint,
        // and an external file would be a round trip for one attribute.
        dangerouslySetInnerHTML={{ __html: 'document.documentElement.lang="el"' }}
      />
      {children}
    </>
  );
}
