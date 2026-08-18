import type { Locale } from "@/lib/i18n";

/**
 * Long-form page copy in both languages.
 *
 * Grouped per page rather than flattened into the key dictionary: a translator
 * needs to see a paragraph in the context of the ones around it, and prose keyed
 * as "about.p3" gives them nothing to work with.
 */

type Block = { heading?: string; paragraphs: string[] };
type PageCopy = { title: string; intro?: string; blocks: Block[] };

// ── About ───────────────────────────────────────────────────────────────────

const aboutEn: PageCopy = {
  title: "About Anadyon Vehicle Rentals",
  blocks: [{ paragraphs: [
    "We are a car, motorbike and bike rental company located on the Island of Zakynthos, in the Ionian Islands, south-western Greece. We are based on the seafront road of Zakynthos Town where you can easily find us, talk to us and decide the best vehicle suited for your holidays in Zakynthos.",
    "Our goal is to provide you with high quality vehicles coupled with excellent service and competitive prices. Our rental fees are designed with simplicity in mind so that we make your vehicle rental as quick and easy as it gets.",
    "Our fleet consists of a variety of cars, motorbikes and bikes that you can pick up from multiple spots across the island — Zakynthos Airport, Zakynthos Port or our office located right in the centre of Zante Town.",
    "Rent a quality car, motorbike or bike at the best prices with Anadyon Rentals and enjoy your holidays in Zante Island care-free!",
  ]}],
};

const aboutEl: PageCopy = {
  title: "Σχετικά με την Anadyon Rentals",
  blocks: [{ paragraphs: [
    "Είμαστε μια εταιρεία ενοικίασης αυτοκινήτων, μηχανών και ποδηλάτων στη Ζάκυνθο, στα Ιόνια Νησιά, στη νοτιοδυτική Ελλάδα. Βρισκόμαστε στην παραλιακή οδό της πόλης της Ζακύνθου, όπου μπορείτε εύκολα να μας βρείτε, να μιλήσετε μαζί μας και να επιλέξετε το όχημα που ταιριάζει καλύτερα στις διακοπές σας.",
    "Στόχος μας είναι να σας προσφέρουμε οχήματα υψηλής ποιότητας, άριστη εξυπηρέτηση και ανταγωνιστικές τιμές. Οι τιμές μας είναι σχεδιασμένες με γνώμονα την απλότητα, ώστε η ενοικίαση να γίνεται όσο πιο γρήγορα και εύκολα γίνεται.",
    "Ο στόλος μας περιλαμβάνει μια μεγάλη ποικιλία από αυτοκίνητα, μηχανές και ποδήλατα, τα οποία μπορείτε να παραλάβετε από διάφορα σημεία του νησιού — από το αεροδρόμιο Ζακύνθου, το λιμάνι Ζακύνθου ή το γραφείο μας στο κέντρο της πόλης.",
    "Ενοικιάστε ένα ποιοτικό αυτοκίνητο, μηχανή ή ποδήλατο στις καλύτερες τιμές με την Anadyon Rentals και απολαύστε ξέγνοιαστα τις διακοπές σας στη Ζάκυνθο!",
  ]}],
};

export const ABOUT_CONTACT_PROMPT: Record<Locale, { text: string; link: string }> = {
  en: { text: "For any additional information regarding vehicle reservations, terms & conditions or any other topic, please don't hesitate to", link: "contact us" },
  el: { text: "Για οποιαδήποτε επιπλέον πληροφορία σχετικά με κρατήσεις οχημάτων, όρους ενοικίασης ή οτιδήποτε άλλο, μη διστάσετε να", link: "επικοινωνήσετε μαζί μας" },
};

export function aboutCopy(locale: Locale): PageCopy {
  return locale === "el" ? aboutEl : aboutEn;
}

// ── Blog ────────────────────────────────────────────────────────────────────

export interface Post { title: string; date: string; excerpt: string; image: string; href: string }

const postsEn: Post[] = [
  {
    title: "Spring in Zakynthos",
    date: "30 March 2016",
    image: "/hero-zakynthos.jpg",
    href: "/blog/spring-in-zakynthos",
    excerpt: "The spring is here! Clear skies, 20°C, superb visibility, bright colours, blossomed trees and the unmistakable rejuvenation smell in the air. What more would you ask from your visit to Zakynthos, Il fiore di Levante? Rent a car, motorbike or bike from Anadyon Rentals and indulge in the spring wellbeing!",
  },
];

const postsEl: Post[] = [
  {
    title: "Άνοιξη στη Ζάκυνθο",
    date: "30 Μαρτίου 2016",
    image: "/hero-zakynthos.jpg",
    href: "/blog/spring-in-zakynthos",
    excerpt: "Η άνοιξη είναι εδώ! Καθαρός ουρανός, 20°C, εξαιρετική ορατότητα, ζωντανά χρώματα, ανθισμένα δέντρα και εκείνη η αναζωογονητική μυρωδιά στον αέρα. Τι άλλο να ζητήσει κανείς από μια επίσκεψη στη Ζάκυνθο, το Fiore di Levante; Ενοικιάστε αυτοκίνητο, μηχανή ή ποδήλατο από την Anadyon Rentals και απολαύστε την άνοιξη!",
  },
];

export const BLOG_TITLE: Record<Locale, string> = { en: "Blog", el: "Blog" };
export const BLOG_READ_MORE: Record<Locale, string> = { en: "Read more →", el: "Διαβάστε περισσότερα →" };

export function posts(locale: Locale): Post[] {
  return locale === "el" ? postsEl : postsEn;
}

export const PAGE_COUNTS = {
  about: { en: aboutEn.blocks[0].paragraphs.length, el: aboutEl.blocks[0].paragraphs.length },
  posts: { en: postsEn.length, el: postsEl.length },
};
