/**
 * Bilingual copy for the public site.
 *
 * English lives at the root (`/cars`) and Greek under a prefix (`/el/cars`), so
 * each language has its own indexable URL and can carry its own hreflang. A
 * language toggle that swapped text in place would leave the Greek content
 * invisible to search, which for a Greek business is the wrong way round.
 *
 * The English routes are untouched by this: Greek pages are separate thin route
 * files that render the same components with a locale, rather than every
 * existing page being moved under a dynamic segment. Nothing that works today
 * had to be edited to add a second language.
 */

export const LOCALES = ["en", "el"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

/** `/cars` → `/el/cars`, and back. Used by the toggle and the hreflang tags. */
export function localePath(path: string, to: Locale): string {
  const bare = path.replace(/^\/el(?=\/|$)/, "") || "/";
  return to === "en" ? bare : `/el${bare === "/" ? "" : bare}`;
}

type Dict = Record<string, string>;

const en: Dict = {
  // ── Navigation ──
  "nav.home": "Home",
  "nav.cars": "Cars",
  "nav.motorbikes": "Motorbikes",
  "nav.bikes": "Bikes",
  "nav.about": "About Us",
  "nav.sights": "Zakynthos Sights",
  "nav.blog": "Blog",
  "nav.contact": "Contact",
  "nav.quote": "My Rental",
  "nav.toggleMenu": "Toggle menu",
  "nav.language": "Ελληνικά",

  // ── Home ──
  "home.title": "Explore Zakynthos Your Way",
  "home.subtitle": "Car, Motorbike and Bike rentals in Zakynthos",
  "home.rentCar": "Rent a Car",
  "home.rentMotorbike": "Rent a Motorbike",
  "home.rentBike": "Rent a Bike",
  "home.familyRun": "Family-run since 2014",
  "home.personalService": "Personal service — real people, real phone",
  "home.noHiddenFees": "No hidden fees",
  "home.stepQuote": "QUOTE",
  "home.stepConfirm": "CONFIRM",
  "home.stepPickup": "PICK UP",

  // ── Benefits ──
  "benefit.mileage": "Unlimited Mileage",
  "benefit.mileageDesc": "Drive as far as you want with no extra charges",
  "benefit.delivery": "Free Delivery",
  "benefit.deliveryDesc": "Free delivery & collection during office hours*",
  "benefit.taxes": "All Taxes Included",
  "benefit.taxesDesc": "No hidden fees — price is what you pay",
  "benefit.assistance": "24h Road Assistance",
  "benefit.assistanceDesc": "We're always available if you need us",
  "benefit.footnote": "* Delivery & collection conditions apply. See our",
  "benefit.footnoteFaq": "FAQ",
  "benefit.footnoteEnd": "for details.",

  // ── Fleet ──
  "fleet.title": "Our Fleet",
  "fleet.subtitle": "Choose your ride and discover the island",
  "fleet.cars": "Cars",
  "fleet.carsDesc": "Economy cars perfect for exploring the island",
  "fleet.carsBest": "Best for families, couples & longer trips",
  "fleet.motorbikes": "Motorbikes",
  "fleet.motorbikesDesc": "Scooters for zipping around Zakynthos",
  "fleet.motorbikesBest": "Best for solo riders & quick island hops",
  "fleet.bikes": "Bikes",
  "fleet.bikesDesc": "City, trekking and mountain bikes",
  "fleet.bikesBest": "Best for active explorers & scenic routes",
  "fleet.view": "View fleet →",

  // ── Why us ──
  "why.title": "Why Choose Anadyon?",
  "why.tagline": "Family-run since 2014",
  "why.intro": "We know Zakynthos inside out. Our team is dedicated to making your rental experience as smooth as possible — from the moment you land to the moment you leave.",
  "why.local": "Local Expertise",
  "why.localDesc": "We know every road, beach and sight on the island. Ask us anything.",
  "why.pricing": "Transparent Pricing",
  "why.pricingDesc": "No surprises. All taxes, CDW and unlimited mileage are included.",
  "why.service": "Personal Service",
  "why.serviceDesc": "You deal directly with us — not a call centre. We pick up the phone.",

  // ── Vehicle pages ──
  "vehicles.carsTitle": "Rent a Car in Zakynthos",
  "vehicles.motorbikesTitle": "Rent a Motorbike in Zakynthos",
  "vehicles.bikesTitle": "Rent a Bike in Zakynthos",
  "vehicles.getQuote": "Get Quote",
  "vehicles.seats": "seats",
  "vehicles.doors": "doors",
  "vehicles.rider": "rider",
  "vehicles.riders": "riders",

  // ── Footer ──
  "footer.faq": "FAQ",
  "footer.terms": "Terms & Conditions",
  "footer.termsOfUse": "Terms of Use",
  "footer.privacy": "Privacy Policy",
  "footer.sitemap": "Sitemap",
  "footer.contact": "Contact Us",
  "footer.copyright": "Copyright © 2014–2026 Anadyon Rentals. All Rights Reserved.",
  "footer.address": "20 Lomvardou Str. (Seafront Road, Zakynthos Town), 29100, Zakynthos, Greece",

  // ── Cookie banner ──
  "cookie.text": "We use cookies to improve your experience and analyse site traffic.",
  "cookie.learnMore": "Learn more",
  "cookie.manage": "Manage preferences",
  "cookie.acceptAll": "Accept all",
  "cookie.prefsTitle": "Cookie preferences",
  "cookie.essential": "Essential cookies",
  "cookie.essentialDesc": "Required for the site to function. Cannot be disabled.",
  "cookie.alwaysOn": "Always on",
  "cookie.analytics": "Analytics cookies",
  "cookie.analyticsDesc": "Google Analytics — helps us understand how visitors use the site. No personal data is sold.",
  "cookie.declineAll": "Decline all",
  "cookie.essentialOnly": "Essential only",
};

const el: Dict = {
  // ── Πλοήγηση ──
  "nav.home": "Αρχική",
  "nav.cars": "Αυτοκίνητα",
  "nav.motorbikes": "Μηχανάκια",
  "nav.bikes": "Ποδήλατα",
  "nav.about": "Σχετικά με εμάς",
  "nav.sights": "Αξιοθέατα Ζακύνθου",
  "nav.blog": "Ιστολόγιο",
  "nav.contact": "Επικοινωνία",
  "nav.quote": "Η Κράτησή μου",
  "nav.toggleMenu": "Άνοιγμα μενού",
  "nav.language": "English",

  // ── Αρχική ──
  "home.title": "Εξερευνήστε τη Ζάκυνθο με τον δικό σας τρόπο",
  "home.subtitle": "Ενοικιάσεις αυτοκινήτων, μηχανακίων και ποδηλάτων στη Ζάκυνθο",
  "home.rentCar": "Ενοικίαση Αυτοκινήτου",
  "home.rentMotorbike": "Ενοικίαση Μηχανακιού",
  "home.rentBike": "Ενοικίαση Ποδηλάτου",
  "home.familyRun": "Οικογενειακή επιχείρηση από το 2014",
  "home.personalService": "Προσωπική εξυπηρέτηση — πραγματικοί άνθρωποι, πραγματικό τηλέφωνο",
  "home.noHiddenFees": "Χωρίς κρυφές χρεώσεις",
  "home.stepQuote": "ΠΡΟΣΦΟΡΑ",
  "home.stepConfirm": "ΕΠΙΒΕΒΑΙΩΣΗ",
  "home.stepPickup": "ΠΑΡΑΛΑΒΗ",

  // ── Παροχές ──
  "benefit.mileage": "Απεριόριστα Χιλιόμετρα",
  "benefit.mileageDesc": "Οδηγήστε όσο θέλετε, χωρίς επιπλέον χρέωση",
  "benefit.delivery": "Δωρεάν Παράδοση",
  "benefit.deliveryDesc": "Δωρεάν παράδοση και παραλαβή εντός ωραρίου λειτουργίας*",
  "benefit.taxes": "Όλοι οι Φόροι Συμπεριλαμβάνονται",
  "benefit.taxesDesc": "Χωρίς κρυφές χρεώσεις — πληρώνετε ό,τι βλέπετε",
  "benefit.assistance": "Οδική Βοήθεια 24ώρες",
  "benefit.assistanceDesc": "Είμαστε πάντα διαθέσιμοι αν μας χρειαστείτε",
  "benefit.footnote": "* Ισχύουν όροι παράδοσης και παραλαβής. Δείτε τις",
  "benefit.footnoteFaq": "Συχνές Ερωτήσεις",
  "benefit.footnoteEnd": "για λεπτομέρειες.",

  // ── Στόλος ──
  "fleet.title": "Ο Στόλος μας",
  "fleet.subtitle": "Επιλέξτε το όχημά σας και ανακαλύψτε το νησί",
  "fleet.cars": "Αυτοκίνητα",
  "fleet.carsDesc": "Οικονομικά αυτοκίνητα, ιδανικά για να εξερευνήσετε το νησί",
  "fleet.carsBest": "Ιδανικά για οικογένειες, ζευγάρια και μεγαλύτερες διαδρομές",
  "fleet.motorbikes": "Μηχανάκια",
  "fleet.motorbikesDesc": "Σκούτερ για εύκολες μετακινήσεις στη Ζάκυνθο",
  "fleet.motorbikesBest": "Ιδανικά για μεμονωμένους οδηγούς και γρήγορες βόλτες",
  "fleet.bikes": "Ποδήλατα",
  "fleet.bikesDesc": "Ποδήλατα πόλης, περιήγησης και βουνού",
  "fleet.bikesBest": "Ιδανικά για δραστήριους εξερευνητές και γραφικές διαδρομές",
  "fleet.view": "Δείτε τον στόλο →",

  // ── Γιατί εμάς ──
  "why.title": "Γιατί να επιλέξετε την Anadyon;",
  "why.tagline": "Οικογενειακή επιχείρηση από το 2014",
  "why.intro": "Γνωρίζουμε τη Ζάκυνθο σε βάθος. Η ομάδα μας φροντίζει ώστε η ενοικίαση να είναι όσο πιο απλή γίνεται — από τη στιγμή που θα φτάσετε μέχρι τη στιγμή που θα φύγετε.",
  "why.local": "Τοπική Γνώση",
  "why.localDesc": "Ξέρουμε κάθε δρόμο, παραλία και αξιοθέατο του νησιού. Ρωτήστε μας οτιδήποτε.",
  "why.pricing": "Διαφανής Τιμολόγηση",
  "why.pricingDesc": "Χωρίς εκπλήξεις. Περιλαμβάνονται όλοι οι φόροι, η μικτή ασφάλεια και τα απεριόριστα χιλιόμετρα.",
  "why.service": "Προσωπική Εξυπηρέτηση",
  "why.serviceDesc": "Συνεννοείστε απευθείας μαζί μας — όχι με τηλεφωνικό κέντρο. Σηκώνουμε το τηλέφωνο.",

  // ── Σελίδες οχημάτων ──
  "vehicles.carsTitle": "Ενοικίαση Αυτοκινήτου στη Ζάκυνθο",
  "vehicles.motorbikesTitle": "Ενοικίαση Μηχανακιού στη Ζάκυνθο",
  "vehicles.bikesTitle": "Ενοικίαση Ποδηλάτου στη Ζάκυνθο",
  "vehicles.getQuote": "Ζητήστε Προσφορά",
  "vehicles.seats": "θέσεις",
  "vehicles.doors": "πόρτες",
  "vehicles.rider": "αναβάτης",
  "vehicles.riders": "αναβάτες",

  // ── Υποσέλιδο ──
  "footer.faq": "Συχνές Ερωτήσεις",
  "footer.terms": "Όροι Ενοικίασης",
  "footer.termsOfUse": "Όροι Χρήσης",
  "footer.privacy": "Πολιτική Απορρήτου",
  "footer.sitemap": "Χάρτης Ιστότοπου",
  "footer.contact": "Επικοινωνήστε μαζί μας",
  "footer.copyright": "Copyright © 2014–2026 Anadyon Rentals. Με την επιφύλαξη παντός δικαιώματος.",
  "footer.address": "Λομβάρδου 20 (Παραλιακή, Ζάκυνθος), 29100, Ζάκυνθος, Ελλάδα",

  // ── Cookies ──
  "cookie.text": "Χρησιμοποιούμε cookies για να βελτιώσουμε την εμπειρία σας και να αναλύσουμε την επισκεψιμότητα.",
  "cookie.learnMore": "Μάθετε περισσότερα",
  "cookie.manage": "Διαχείριση προτιμήσεων",
  "cookie.acceptAll": "Αποδοχή όλων",
  "cookie.prefsTitle": "Προτιμήσεις cookies",
  "cookie.essential": "Απαραίτητα cookies",
  "cookie.essentialDesc": "Απαιτούνται για τη λειτουργία του ιστότοπου. Δεν μπορούν να απενεργοποιηθούν.",
  "cookie.alwaysOn": "Πάντα ενεργά",
  "cookie.analytics": "Cookies ανάλυσης",
  "cookie.analyticsDesc": "Google Analytics — μας βοηθά να κατανοήσουμε πώς χρησιμοποιείται ο ιστότοπος. Δεν πωλούνται προσωπικά δεδομένα.",
  "cookie.declineAll": "Απόρριψη όλων",
  "cookie.essentialOnly": "Μόνο τα απαραίτητα",
};

const dictionaries: Record<Locale, Dict> = { en, el };

/**
 * Looks up a string for a locale.
 *
 * Falls back to English rather than rendering the key, so a Greek string that
 * has not been written yet shows readable English instead of `fleet.title` in
 * the middle of the page. The missing key is logged in development so the gap
 * is visible while building without being visible to a customer.
 */
export function t(locale: Locale, key: string): string {
  const value = dictionaries[locale]?.[key];
  if (value !== undefined) return value;
  if (process.env.NODE_ENV === "development" && locale !== DEFAULT_LOCALE) {
    console.warn(`[i18n] missing ${locale} string: ${key}`);
  }
  return dictionaries[DEFAULT_LOCALE][key] ?? key;
}

/** Bound accessor, so a component reads `tr("nav.cars")` rather than repeating the locale. */
export function translator(locale: Locale) {
  return (key: string) => t(locale, key);
}

/** Every key that has no Greek value — used by the coverage test. */
export function missingKeys(locale: Locale): string[] {
  return Object.keys(dictionaries[DEFAULT_LOCALE]).filter(k => dictionaries[locale][k] === undefined);
}
