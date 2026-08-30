/**
 * Country names as this system stores them → ISO 3166-1 alpha-2, as AADE files.
 *
 * ─── The defect this exists to close ───
 *
 * Both AADE modules sent a country *name* where the schema wants a *code*.
 * `app/components/BookingForm.tsx` builds its dropdown with
 * `Intl.DisplayNames(["en"], { type: "region" })` and stores **the English
 * display name as the value** — so `customers.country` holds "United Kingdom",
 * not "GB". The DCL module was worse again: it read `customers.nationality`,
 * which is free text with the placeholder "e.g. British", and put that in
 * `<counterpartCountry>`. A demonym is not a country name, let alone a code.
 *
 * Since most Anadyon customers are foreign, nearly every filing would have
 * carried an invalid value.
 *
 * ─── Why the map is derived rather than typed out ───
 *
 * It is built by inverting the very function the form used to produce those
 * strings. A hand-written table would be a second source of truth that drifts
 * the first time someone adds a country to the dropdown; this cannot drift,
 * because it is the same list read backwards.
 */

// The list the booking form offers. Kept here as the single source and
// re-exported so the form can import it rather than hold its own copy.
export const COUNTRY_CODES = [
  "AD","AE","AF","AL","AM","AO","AR","AT","AU","AZ","BA","BD","BE","BG","BH","BO",
  "BR","BY","CA","CH","CL","CN","CO","CY","CZ","DE","DK","DZ","EC","EE","EG","ES",
  "FI","GB","GE","GH","GR","HR","HU","ID","IE","IL","IN","IQ","IR","IS","IT","JO",
  "JP","KE","KH","KR","KW","KZ","LB","LT","LU","LV","MA","MD","ME","MK","MT","MX",
  "MY","NG","NL","NO","NZ","OM","PE","PH","PK","PL","PS","PT","QA","RO","SA","SE",
  "SG","SI","SK","TH","TN","TR","UA","US","VE","VN","ZA",
] as const;

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** name → code, built once from the same Intl data the form wrote with. */
const BY_NAME: Map<string, string> = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();
  for (const code of COUNTRY_CODES) {
    const name = names.of(code);
    if (name) map.set(normalise(name), code);
    map.set(normalise(code), code);
  }
  // Names people type by hand into the admin form that Intl does not return.
  // Deliberately short: every entry here is a guess about someone's typing, and
  // a wrong guess files a wrong country. Only unambiguous aliases belong.
  for (const [alias, code] of [
    ["uk", "GB"],
    ["united kingdom of great britain and northern ireland", "GB"],
    ["great britain", "GB"],
    ["england", "GB"],
    ["scotland", "GB"],
    ["wales", "GB"],
    ["northern ireland", "GB"],
    ["usa", "US"],
    ["u.s.a.", "US"],
    ["united states of america", "US"],
    ["holland", "NL"],
    ["czechia", "CZ"],
    ["czech republic", "CZ"],
    ["hellas", "GR"],
    ["ελλάδα", "GR"],
  ] as const) {
    map.set(normalise(alias), code);
  }
  return map;
})();

/**
 * Resolve a stored country to an ISO code, or `null` when it cannot be known.
 *
 * **Null is the important half.** The callers must refuse to file rather than
 * guess: a submission AADE rejects can be corrected, but one it *accepts*
 * carrying the wrong country is a false statutory record that nobody will
 * notice. Defaulting to "GR" — which both modules did — is precisely that
 * failure, and it would have been silent.
 */
export function toIsoCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  return BY_NAME.get(normalise(value)) ?? null;
}
