import { DRIVER_AGE_FAQ, DRIVER_AGE_FAQ_EL } from "@/lib/rentalPolicy";
import type { Locale } from "@/lib/i18n";

/**
 * FAQ content in both languages.
 *
 * Long-form copy lives here rather than in the flat key dictionary: a paragraph
 * keyed as "faq.q7.a" tells a translator nothing about where it sits, and the
 * flat file becomes unreadable once it holds prose as well as button labels.
 *
 * The two arrays are index-aligned, and a test asserts they stay that way — a
 * Greek array one entry short would silently drop a question rather than fail.
 */
export interface Faq { q: string; a: string }

const en: Faq[] = [
  { q: "Do I need an International driver's licence?",
    a: "You don't need an International driver's licence if your driving permit is issued by an EU or EFTA country. For all other countries please contact us for more details. If your licence is printed in an alphabet other than Greek or Latin you would need to present an International licence." },
  { q: "What is the minimum age to rent a car, motorbike or bike?", a: DRIVER_AGE_FAQ },
  { q: "Is there a daily/weekly limit on the miles/kilometres driven?",
    a: "No, unlimited mileage applies to all our rentals." },
  { q: "Are taxes included in your rental fees?",
    a: "Yes, all applicable taxes are already included in the rental fees we quote." },
  { q: "Do you charge delivery/collection fees?",
    a: "All deliveries and collections (Airport, Zakynthos Port and our office) during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office." },
  { q: "What do I need to do if my car/motorbike breaks down?",
    a: "Give us a call and stay where you are. We will come to assist you as soon as possible." },
  { q: "What type of insurance is included in your standard fees?",
    a: "Our standard fees include Collision Damage Waiver (CDW), Theft insurance, and Third Party insurance." },
  { q: "Do you offer any additional insurance?",
    a: "Yes, for an additional fee we offer Full Damage Waiver (FDW)." },
  { q: "If I buy all insurance packages, am I fully covered?",
    a: "The insurance does not cover damages to the bottom of the vehicle, wheels, tyres, mirrors, loss or theft of keys, windows and the interior of the vehicle." },
  { q: "Are there any hidden extras I will need to pay?",
    a: "No hidden extras — our fees are all inclusive." },
  { q: "What if I have to cancel my reservation?",
    a: "If you let us know more than 24 hours prior to the start date of the rental we will not charge any cancellation fee. In all other cases we will charge a day's rental." },
  { q: "Can my partner/friend drive the car/motorbike too?",
    a: "Yes, you would just need to tell us at the start of the rental and pay the additional driver's fee." },
];

const el: Faq[] = [
  { q: "Χρειάζομαι διεθνές δίπλωμα οδήγησης;",
    a: "Δεν χρειάζεστε διεθνές δίπλωμα οδήγησης εάν η άδεια οδήγησής σας έχει εκδοθεί από χώρα της ΕΕ ή της ΕΖΕΣ. Για όλες τις άλλες χώρες παρακαλούμε επικοινωνήστε μαζί μας για περισσότερες λεπτομέρειες. Εάν το δίπλωμά σας είναι τυπωμένο σε αλφάβητο άλλο από το ελληνικό ή το λατινικό, θα χρειαστεί να προσκομίσετε διεθνές δίπλωμα." },
  { q: "Ποιο είναι το ελάχιστο όριο ηλικίας για ενοικίαση αυτοκινήτου, μηχανής ή ποδηλάτου;", a: DRIVER_AGE_FAQ_EL },
  { q: "Υπάρχει ημερήσιο ή εβδομαδιαίο όριο χιλιομέτρων;",
    a: "Όχι, σε όλες τις ενοικιάσεις μας ισχύουν απεριόριστα χιλιόμετρα." },
  { q: "Περιλαμβάνονται οι φόροι στις τιμές ενοικίασης;",
    a: "Ναι, όλοι οι φόροι περιλαμβάνονται ήδη στις τιμές που σας δίνουμε." },
  { q: "Υπάρχει χρέωση για την παράδοση και την παραλαβή;",
    a: "Όλες οι παραδόσεις και παραλαβές (αεροδρόμιο, λιμάνι Ζακύνθου και το γραφείο μας) εντός ωραρίου λειτουργίας (09:00–21:00) γίνονται δωρεάν. Εκτός ωραρίου ισχύει χρέωση 20€. Τα ποδήλατα παραδίδονται και παραλαμβάνονται μόνο από το γραφείο μας." },
  { q: "Τι κάνω αν το αυτοκίνητο ή η μηχανή μου πάθει βλάβη;",
    a: "Τηλεφωνήστε μας και παραμείνετε εκεί που βρίσκεστε. Θα έρθουμε να σας βοηθήσουμε το συντομότερο δυνατό." },
  { q: "Τι ασφάλιση περιλαμβάνεται στις βασικές τιμές σας;",
    a: "Οι βασικές τιμές μας περιλαμβάνουν Μεικτή Ασφάλεια (CDW), ασφάλεια κλοπής και ασφάλιση αστικής ευθύνης προς τρίτους." },
  { q: "Προσφέρετε πρόσθετη ασφάλιση;",
    a: "Ναι, με επιπλέον χρέωση προσφέρουμε Πλήρη Κάλυψη Ζημιών (FDW)." },
  { q: "Αν επιλέξω όλα τα πακέτα ασφάλισης, καλύπτομαι πλήρως;",
    a: "Η ασφάλιση δεν καλύπτει ζημιές στο κάτω μέρος του οχήματος, στους τροχούς, στα ελαστικά, στους καθρέπτες, απώλεια ή κλοπή κλειδιών, στα τζάμια και στο εσωτερικό του οχήματος." },
  { q: "Υπάρχουν κρυφές χρεώσεις που θα χρειαστεί να πληρώσω;",
    a: "Καμία κρυφή χρέωση — οι τιμές μας είναι τελικές." },
  { q: "Τι γίνεται αν χρειαστεί να ακυρώσω την κράτησή μου;",
    a: "Εάν μας ενημερώσετε περισσότερες από 24 ώρες πριν την έναρξη της ενοικίασης, δεν χρεώνεται τίποτα. Σε κάθε άλλη περίπτωση χρεώνεται μία ημέρα ενοικίασης." },
  { q: "Μπορεί να οδηγήσει και ο σύντροφος ή ο φίλος μου;",
    a: "Ναι, αρκεί να μας το πείτε κατά την έναρξη της ενοικίασης και να καταβάλετε το κόστος πρόσθετου οδηγού." },
];

export const FAQ_TITLE: Record<Locale, string> = {
  en: "Frequently Asked Questions",
  el: "Συχνές Ερωτήσεις",
};

export function faqs(locale: Locale): Faq[] {
  return locale === "el" ? el : en;
}

/** Exposed so the coverage test can compare lengths without importing internals. */
export const FAQ_COUNTS = { en: en.length, el: el.length };
