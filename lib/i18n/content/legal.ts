import type { Locale } from "@/lib/i18n";

/**
 * The legal and reference pages in both languages.
 *
 * Kept apart from pages.ts because these are the pages a lawyer reads rather
 * than a customer: terms, website terms and the privacy notice. Their wording
 * is reviewed as a whole, so it is stored as whole sections rather than as
 * individual keys.
 *
 * Links inside prose are written as placeholders — {contact}, {privacy},
 * {cars}, {motorbikes}, {bikes} — and resolved by the renderer, which knows the
 * current locale and can therefore point at /el/contact rather than /contact.
 * Writing raw anchors into the copy would hard-code the English URL into the
 * Greek text, which is how a translated site quietly sends its readers back to
 * the other language.
 */

export interface Table {
  headers: string[];
  rows: string[][];
  /** Column indexes rendered in monospace, for cookie names and the like. */
  mono?: number[];
}

export interface Section {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
  table?: Table;
  /** Paragraphs rendered after the list or table. */
  after?: string[];
}

export interface LegalPage {
  title: string;
  intro?: string;
  sections: Section[];
  /** Closing line, usually the "contact us" prompt. */
  closing?: string;
}

// ── Rental terms ────────────────────────────────────────────────────────────

const termsEn: LegalPage = {
  title: "Vehicle Reservation Terms & Conditions",
  sections: [
    { heading: "1. Driver's Licence", paragraphs: ["A valid driving licence recognised by the Greek authorities must be held by the driver."] },
    { heading: "2. Driver's Age", paragraphs: ["__AGE_POLICY__"] },
    { heading: "3. Credit Card", paragraphs: ["The driver must hold a valid credit card."] },
    { heading: "4. Delivery / Collection Fees", paragraphs: ["All deliveries and collections at the Airport, Zakynthos Port and our Office during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office."] },
    { heading: "5. Unlimited Mileage", paragraphs: ["Unlimited mileage applies to all rentals."] },
    {
      heading: "6. Insurance",
      paragraphs: ["All our rentals include:"],
      list: ["Third party insurance", "Theft insurance", "Collision Damage Waiver (CDW)"],
      after: ["Additional cover such as Full Damage Waiver (FDW) is available for an additional fee. Bicycles are not covered by the above."],
    },
    { heading: "7. Cancellation", paragraphs: ["All cancellations received more than 24 hours prior to the start of the rental are free of charge. All other cancellations will be subject to one day's rental charge."] },
    { heading: "8. Taxes", paragraphs: ["Our fees include VAT and all local taxes."] },
    { heading: "9. Road Assistance", paragraphs: ["We provide free 24-hour roadside assistance."] },
    { heading: "10. Customer Service", paragraphs: ["Our staff will go above and beyond to ensure you get a hassle-free rental experience. For any additional information please {contact}."] },
  ],
};

const termsEl: LegalPage = {
  title: "Όροι και Προϋποθέσεις Ενοικίασης",
  sections: [
    { heading: "1. Άδεια Οδήγησης", paragraphs: ["Ο οδηγός πρέπει να κατέχει έγκυρη άδεια οδήγησης, αναγνωρισμένη από τις ελληνικές αρχές."] },
    { heading: "2. Ηλικία Οδηγού", paragraphs: ["__AGE_POLICY__"] },
    { heading: "3. Πιστωτική Κάρτα", paragraphs: ["Ο οδηγός πρέπει να κατέχει έγκυρη πιστωτική κάρτα."] },
    { heading: "4. Χρεώσεις Παράδοσης / Παραλαβής", paragraphs: ["Όλες οι παραδόσεις και παραλαβές στο Αεροδρόμιο, στο Λιμάνι Ζακύνθου και στο γραφείο μας εντός ωραρίου λειτουργίας (09:00–21:00) γίνονται χωρίς χρέωση. Εκτός ωραρίου ισχύει χρέωση 20 €. Τα ποδήλατα παραδίδονται και παραλαμβάνονται μόνο από το γραφείο μας."] },
    { heading: "5. Απεριόριστα Χιλιόμετρα", paragraphs: ["Όλες οι ενοικιάσεις περιλαμβάνουν απεριόριστα χιλιόμετρα."] },
    {
      heading: "6. Ασφάλιση",
      paragraphs: ["Όλες οι ενοικιάσεις μας περιλαμβάνουν:"],
      list: ["Ασφάλιση αστικής ευθύνης προς τρίτους", "Ασφάλιση κλοπής", "Μεικτή Ασφάλεια (CDW)"],
      after: ["Πρόσθετη κάλυψη, όπως η Πλήρης Απαλλαγή Ζημιών (FDW), διατίθεται με επιπλέον χρέωση. Τα ποδήλατα δεν καλύπτονται από τα παραπάνω."],
    },
    { heading: "7. Ακύρωση", paragraphs: ["Όλες οι ακυρώσεις που γίνονται περισσότερο από 24 ώρες πριν από την έναρξη της ενοικίασης είναι δωρεάν. Για κάθε άλλη ακύρωση χρεώνεται το κόστος μίας ημέρας ενοικίασης."] },
    { heading: "8. Φόροι", paragraphs: ["Οι τιμές μας περιλαμβάνουν ΦΠΑ και όλους τους τοπικούς φόρους."] },
    { heading: "9. Οδική Βοήθεια", paragraphs: ["Παρέχουμε δωρεάν οδική βοήθεια 24 ώρες το 24ωρο."] },
    { heading: "10. Εξυπηρέτηση Πελατών", paragraphs: ["Το προσωπικό μας θα κάνει ό,τι χρειαστεί ώστε η ενοικίασή σας να είναι απόλυτα ξεκούραστη. Για οποιαδήποτε επιπλέον πληροφορία {contact}."] },
  ],
};

// ── Website terms of use ────────────────────────────────────────────────────

const termsOfUseEn: LegalPage = {
  title: "Website Terms of Use",
  sections: [
    { heading: "1. Terms", paragraphs: ["By accessing this website, you are agreeing to be bound by these website Terms and Conditions of Use, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws. If you do not agree with any of these terms, you are prohibited from using or accessing this site. The materials contained in this website are protected by applicable copyright and trade mark law."] },
    {
      heading: "2. Use Licence",
      paragraphs: ["Permission is granted to temporarily download one copy of the materials on Anadyon Rentals's website for personal, non-commercial transitory viewing only. This is the grant of a licence, not a transfer of title, and under this licence you may not:"],
      list: [
        "modify or copy the materials;",
        "use the materials for any commercial purpose, or for any public display (commercial or non-commercial);",
        "attempt to decompile or reverse engineer any software contained on Anadyon Rentals's website;",
        "remove any copyright or other proprietary notations from the materials; or",
        "transfer the materials to another person or “mirror” the materials on any other server.",
      ],
      after: ["This licence shall automatically terminate if you violate any of these restrictions and may be terminated by Anadyon Rentals at any time. Upon terminating your viewing of these materials or upon the termination of this licence, you must destroy any downloaded materials in your possession whether in electronic or printed format."],
    },
    { heading: "3. Disclaimer", paragraphs: ["The materials on Anadyon Rentals's website are provided “as is”. Anadyon Rentals makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties, including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights. Further, Anadyon Rentals does not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on its website or otherwise relating to such materials or on any sites linked to this site."] },
    { heading: "4. Limitations", paragraphs: ["In no event shall Anadyon Rentals or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Anadyon Rentals's website, even if Anadyon Rentals or an authorised representative has been notified orally or in writing of the possibility of such damage."] },
    { heading: "5. Revisions and Errata", paragraphs: ["The materials appearing on Anadyon Rentals's website could include technical, typographical, or photographic errors. Anadyon Rentals does not warrant that any of the materials on its website are accurate, complete, or current. Anadyon Rentals may make changes to the materials contained on its website at any time without notice."] },
    { heading: "6. Links", paragraphs: ["Anadyon Rentals has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Anadyon Rentals of the site. Use of any such linked website is at the user's own risk."] },
    { heading: "7. Site Terms of Use Modifications", paragraphs: ["Anadyon Rentals may revise these terms of use for its website at any time without notice. By using this website you are agreeing to be bound by the then current version of these Terms and Conditions of Use."] },
    { heading: "8. Governing Law", paragraphs: ["Any claim relating to Anadyon Rentals's website shall be governed by the Greek laws without regard to its conflict of law provisions."] },
    { heading: "Privacy & Personal Data", paragraphs: ["How we collect, use, store and share personal data — and the rights you have over it — is set out in full in our {privacy}."] },
  ],
  closing: "For any additional information please {contact}.",
};

const termsOfUseEl: LegalPage = {
  title: "Όροι Χρήσης Ιστότοπου",
  sections: [
    { heading: "1. Όροι", paragraphs: ["Με την πρόσβαση στον παρόντα ιστότοπο, συμφωνείτε να δεσμεύεστε από τους παρόντες Όρους Χρήσης, από κάθε εφαρμοστέο νόμο και κανονισμό, και αποδέχεστε ότι είστε υπεύθυνοι για τη συμμόρφωση με την κατά τόπον ισχύουσα νομοθεσία. Εάν δεν συμφωνείτε με οποιονδήποτε από τους όρους αυτούς, απαγορεύεται η χρήση ή η πρόσβαση στον ιστότοπο. Το περιεχόμενο του ιστότοπου προστατεύεται από την ισχύουσα νομοθεσία περί πνευματικής ιδιοκτησίας και εμπορικών σημάτων."] },
    {
      heading: "2. Άδεια Χρήσης",
      paragraphs: ["Επιτρέπεται η προσωρινή λήψη ενός αντιγράφου του υλικού του ιστότοπου της Anadyon Rentals αποκλειστικά για προσωπική, μη εμπορική και παροδική προβολή. Πρόκειται για παραχώρηση άδειας και όχι για μεταβίβαση κυριότητας· βάσει της άδειας αυτής δεν επιτρέπεται να:"],
      list: [
        "τροποποιείτε ή αντιγράφετε το υλικό·",
        "χρησιμοποιείτε το υλικό για οποιονδήποτε εμπορικό σκοπό ή για δημόσια προβολή (εμπορική ή μη)·",
        "επιχειρείτε αποσυμπίληση ή αντίστροφη μηχανίκευση οποιουδήποτε λογισμικού του ιστότοπου της Anadyon Rentals·",
        "αφαιρείτε ενδείξεις πνευματικών δικαιωμάτων ή άλλες ενδείξεις ιδιοκτησίας από το υλικό· ή",
        "μεταβιβάζετε το υλικό σε τρίτο πρόσωπο ή να δημιουργείτε «κατοπτρισμό» του υλικού σε άλλον διακομιστή.",
      ],
      after: ["Η άδεια αυτή παύει αυτοδικαίως εάν παραβιάσετε οποιονδήποτε από τους παραπάνω περιορισμούς και μπορεί να ανακληθεί από την Anadyon Rentals οποτεδήποτε. Με τη λήξη της προβολής του υλικού ή με την ανάκληση της άδειας, οφείλετε να καταστρέψετε κάθε ληφθέν υλικό που έχετε στην κατοχή σας, σε ηλεκτρονική ή έντυπη μορφή."],
    },
    { heading: "3. Αποποίηση Ευθύνης", paragraphs: ["Το υλικό του ιστότοπου της Anadyon Rentals παρέχεται «ως έχει». Η Anadyon Rentals δεν παρέχει εγγυήσεις, ρητές ή σιωπηρές, και δια του παρόντος αποποιείται κάθε άλλη εγγύηση, συμπεριλαμβανομένων ενδεικτικά των σιωπηρών εγγυήσεων εμπορευσιμότητας, καταλληλότητας για συγκεκριμένο σκοπό ή μη προσβολής δικαιωμάτων πνευματικής ιδιοκτησίας. Επιπλέον, η Anadyon Rentals δεν εγγυάται ούτε προβαίνει σε δηλώσεις σχετικά με την ακρίβεια, τα πιθανά αποτελέσματα ή την αξιοπιστία της χρήσης του υλικού του ιστότοπου ή υλικού συνδεδεμένων ιστότοπων."] },
    { heading: "4. Περιορισμοί Ευθύνης", paragraphs: ["Σε καμία περίπτωση η Anadyon Rentals ή οι προμηθευτές της δεν ευθύνονται για οποιαδήποτε ζημία (συμπεριλαμβανομένων ενδεικτικά ζημιών από απώλεια δεδομένων ή κέρδους ή από διακοπή επιχειρηματικής δραστηριότητας) που προκύπτει από τη χρήση ή την αδυναμία χρήσης του υλικού του ιστότοπου της Anadyon Rentals, ακόμη και εάν η Anadyon Rentals ή εξουσιοδοτημένος εκπρόσωπός της έχει ενημερωθεί προφορικώς ή εγγράφως για την πιθανότητα τέτοιας ζημίας."] },
    { heading: "5. Αναθεωρήσεις και Σφάλματα", paragraphs: ["Το υλικό που εμφανίζεται στον ιστότοπο της Anadyon Rentals ενδέχεται να περιέχει τεχνικά, τυπογραφικά ή φωτογραφικά σφάλματα. Η Anadyon Rentals δεν εγγυάται ότι το υλικό του ιστότοπου είναι ακριβές, πλήρες ή επίκαιρο, και δύναται να προβαίνει σε αλλαγές οποτεδήποτε και χωρίς προειδοποίηση."] },
    { heading: "6. Σύνδεσμοι", paragraphs: ["Η Anadyon Rentals δεν έχει ελέγξει το σύνολο των ιστότοπων που συνδέονται με τον δικό της και δεν φέρει ευθύνη για το περιεχόμενό τους. Η ύπαρξη οποιουδήποτε συνδέσμου δεν συνεπάγεται έγκριση του αντίστοιχου ιστότοπου από την Anadyon Rentals. Η χρήση κάθε τέτοιου συνδεδεμένου ιστότοπου γίνεται με αποκλειστική ευθύνη του χρήστη."] },
    { heading: "7. Τροποποιήσεις των Όρων Χρήσης", paragraphs: ["Η Anadyon Rentals δύναται να αναθεωρεί τους παρόντες όρους χρήσης οποτεδήποτε και χωρίς προειδοποίηση. Με τη χρήση του ιστότοπου συμφωνείτε να δεσμεύεστε από την εκάστοτε ισχύουσα έκδοση των Όρων Χρήσης."] },
    { heading: "8. Εφαρμοστέο Δίκαιο", paragraphs: ["Κάθε αξίωση σχετική με τον ιστότοπο της Anadyon Rentals διέπεται από το ελληνικό δίκαιο, χωρίς εφαρμογή των κανόνων ιδιωτικού διεθνούς δικαίου."] },
    { heading: "Απόρρητο & Προσωπικά Δεδομένα", paragraphs: ["Ο τρόπος με τον οποίο συλλέγουμε, χρησιμοποιούμε, αποθηκεύουμε και διαβιβάζουμε προσωπικά δεδομένα — και τα δικαιώματα που έχετε επ' αυτών — περιγράφεται αναλυτικά στην {privacy}."] },
  ],
  closing: "Για οποιαδήποτε επιπλέον πληροφορία {contact}.",
};

// ── Sights ──────────────────────────────────────────────────────────────────

export interface Sight { name: string; desc: string; image: string | null }

const sightsEn: Sight[] = [
  { name: "The Shipwreck Beach (Navagio)", desc: "The landmark of the island and one of the best awarded beaches worldwide — you just have to visit! Also known as Smuggler's Wreck, it is only accessible by boat.", image: "/hero-zakynthos.jpg" },
  { name: "Blue Caves", desc: "Rent a boat or join a cruise to swim in the deep blue waters of the Blue Caves, located on the north-east part of the island. Corals on the rocks and the sea bottom give an amazing crystal blue colour to the water inside the caves.", image: null },
  { name: "Marathonissi Island (Turtle Island) & Keri Caves", desc: "A small tropical isle just a few minutes from the village of Keri, in the south-western part of Zante. Rent a boat or join a cruise. Keri Caves with their unique rock formations and hidden private beach caves are waiting for you to explore.", image: null },
  { name: "Scenic Sunsets on the West-Side Cliffs", desc: "Don't miss the sunset from one of the many spots on the west side of the island: Keri Lighthouse, Porto Roxa, Limnionas or Kampi. The colours of the horizon during an Ionian sunset will enchant you.", image: null },
  { name: "National Marine Park of Zakynthos", desc: "The Park covers multiple beaches around Laganas Bay on the south side of the island: Daphne, Gerakas, Sekania, Kalamaki, Laganas, Agios Sostis, Porto Koukla and Keri Lake. Rent a boat or go snorkelling to swim with the protected Loggerhead Sea Turtle (Caretta-Caretta).", image: "/zakynthos-turtles.jpg" },
  { name: "Zakynthos Town", desc: "Stroll around the alleys of Zakynthos Town, taste and buy traditional local products such as Mantolato, Mantoles and Fitoura. Visit the grand church of St. Dionysios, the Byzantine Museum and the Dionysios Solomos Museum, hosting the mausoleums of two of Greece's most important poets.", image: "/zakynthos-town.jpg" },
];

const sightsEl: Sight[] = [
  { name: "Ναυάγιο (Παραλία Ναυαγίου)", desc: "Το σήμα κατατεθέν του νησιού και μία από τις πιο βραβευμένες παραλίες παγκοσμίως — αξίζει οπωσδήποτε μια επίσκεψη. Είναι προσβάσιμη μόνο διά θαλάσσης.", image: "/hero-zakynthos.jpg" },
  { name: "Γαλάζιες Σπηλιές", desc: "Νοικιάστε σκάφος ή συμμετέχετε σε κρουαζιέρα για να κολυμπήσετε στα βαθιά γαλάζια νερά των Γαλάζιων Σπηλιών, στο βορειοανατολικό τμήμα του νησιού. Τα κοράλλια στους βράχους και στον βυθό χαρίζουν στο νερό ένα εκπληκτικό κρυστάλλινο γαλάζιο χρώμα.", image: null },
  { name: "Μαραθονήσι (Νησί της Χελώνας) & Σπηλιές Κερίου", desc: "Ένα μικρό τροπικό νησάκι λίγα λεπτά από το χωριό Κερί, στο νοτιοδυτικό άκρο της Ζακύνθου. Νοικιάστε σκάφος ή συμμετέχετε σε κρουαζιέρα. Οι Σπηλιές Κερίου, με τους μοναδικούς βραχώδεις σχηματισμούς και τις κρυμμένες παραλίες τους, σας περιμένουν να τις εξερευνήσετε.", image: null },
  { name: "Ηλιοβασιλέματα στους Δυτικούς Βράχους", desc: "Μη χάσετε το ηλιοβασίλεμα από ένα από τα πολλά σημεία της δυτικής πλευράς του νησιού: Φάρος Κεριού, Πόρτο Ρόξα, Λιμνιώνας ή Καμπί. Τα χρώματα του ορίζοντα σε ένα ιόνιο ηλιοβασίλεμα θα σας μαγέψουν.", image: null },
  { name: "Εθνικό Θαλάσσιο Πάρκο Ζακύνθου", desc: "Το Πάρκο περιλαμβάνει πολλές παραλίες γύρω από τον κόλπο του Λαγανά, στη νότια πλευρά του νησιού: Δάφνη, Γέρακας, Σεκάνια, Καλαμάκι, Λαγανάς, Άγιος Σώστης, Πόρτο Κούκλα και Λίμνη Κεριού. Νοικιάστε σκάφος ή κάντε κατάδυση με αναπνευστήρα για να κολυμπήσετε με την προστατευόμενη θαλάσσια χελώνα Caretta-Caretta.", image: "/zakynthos-turtles.jpg" },
  { name: "Πόλη της Ζακύνθου", desc: "Περπατήστε στα σοκάκια της πόλης, δοκιμάστε και αγοράστε παραδοσιακά τοπικά προϊόντα όπως μαντολάτο, μάντολες και φιτούρα. Επισκεφθείτε τον επιβλητικό ναό του Αγίου Διονυσίου, το Βυζαντινό Μουσείο και το Μουσείο Διονυσίου Σολωμού, όπου φυλάσσονται τα μαυσωλεία δύο από τους σημαντικότερους ποιητές της Ελλάδας.", image: "/zakynthos-town.jpg" },
];

export const SIGHTS_COPY: Record<Locale, { title: string; intro: string; ctaTitle: string; ctaBody: string }> = {
  en: {
    title: "Zakynthos Sights",
    intro: "Welcome to Zakynthos! Also known as Zante, this majestic Greek island sits on the south-west of the Ionian Sea. Tropical beaches with crystal clear turquoise waters, lush vegetation and the warm character of the locals make it the ideal summer destination. Many hidden treasures are waiting for you — and the best way to explore them is with your own wheels.",
    ctaTitle: "Explore Zakynthos with Anadyon Rentals",
    ctaBody: "Rent a {cars}, {motorbikes} or {bikes} and make your holidays in Zakynthos an unforgettable experience!",
  },
  el: {
    title: "Αξιοθέατα Ζακύνθου",
    intro: "Καλώς ήρθατε στη Ζάκυνθο! Το μαγευτικό αυτό ελληνικό νησί βρίσκεται στα νοτιοδυτικά του Ιονίου Πελάγους. Οι τροπικές παραλίες με τα κρυστάλλινα γαλαζοπράσινα νερά, η πλούσια βλάστηση και η ζεστή φιλοξενία των κατοίκων το καθιστούν ιδανικό καλοκαιρινό προορισμό. Πολλοί κρυμμένοι θησαυροί σας περιμένουν — και ο καλύτερος τρόπος να τους ανακαλύψετε είναι με το δικό σας μέσο.",
    ctaTitle: "Εξερευνήστε τη Ζάκυνθο με την Anadyon Rentals",
    ctaBody: "Νοικιάστε {cars}, {motorbikes} ή {bikes} και κάντε τις διακοπές σας στη Ζάκυνθο μια αξέχαστη εμπειρία!",
  },
};

export function sights(locale: Locale): Sight[] {
  return locale === "el" ? sightsEl : sightsEn;
}

// ── Site map ────────────────────────────────────────────────────────────────

export interface MapSection { title: string; links: { href: string; label: string }[] }

const sitemapEn: MapSection[] = [
  { title: "Rent a Car in Zakynthos", links: [{ href: "/cars", label: "All Cars" }] },
  { title: "Rent a Motorbike in Zakynthos", links: [{ href: "/motorbikes", label: "All Motorbikes" }] },
  { title: "Rent a Bike in Zakynthos", links: [{ href: "/bikes", label: "All Bikes" }] },
  { title: "About", links: [
    { href: "/about", label: "About Us" },
    { href: "/sights", label: "Zakynthos Sights" },
    { href: "/blog", label: "Blog" },
  ]},
  { title: "Information", links: [
    { href: "/faq", label: "FAQ" },
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/terms-of-use", label: "Terms of Use" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/contact", label: "Contact Us" },
  ]},
];

const sitemapEl: MapSection[] = [
  { title: "Ενοικίαση Αυτοκινήτου στη Ζάκυνθο", links: [{ href: "/cars", label: "Όλα τα Αυτοκίνητα" }] },
  { title: "Ενοικίαση Μηχανής στη Ζάκυνθο", links: [{ href: "/motorbikes", label: "Όλες οι Μηχανές" }] },
  { title: "Ενοικίαση Ποδηλάτου στη Ζάκυνθο", links: [{ href: "/bikes", label: "Όλα τα Ποδήλατα" }] },
  { title: "Η Εταιρεία", links: [
    { href: "/about", label: "Σχετικά με εμάς" },
    { href: "/sights", label: "Αξιοθέατα Ζακύνθου" },
    { href: "/blog", label: "Blog" },
  ]},
  { title: "Πληροφορίες", links: [
    { href: "/faq", label: "Συχνές Ερωτήσεις" },
    { href: "/terms", label: "Όροι και Προϋποθέσεις" },
    { href: "/terms-of-use", label: "Όροι Χρήσης" },
    { href: "/privacy-policy", label: "Πολιτική Απορρήτου" },
    { href: "/contact", label: "Επικοινωνία" },
  ]},
];

export const SITEMAP_COPY: Record<Locale, { title: string; intro: string }> = {
  en: { title: "Sitemap", intro: "Find all pages on the Anadyon Rentals website. For any additional information please {contact}." },
  el: { title: "Χάρτης Ιστότοπου", intro: "Βρείτε όλες τις σελίδες του ιστότοπου της Anadyon Rentals. Για οποιαδήποτε επιπλέον πληροφορία {contact}." },
};

export function sitemapSections(locale: Locale): MapSection[] {
  return locale === "el" ? sitemapEl : sitemapEn;
}

// ── Accessors ───────────────────────────────────────────────────────────────

export function termsCopy(locale: Locale): LegalPage {
  return locale === "el" ? termsEl : termsEn;
}

export function termsOfUseCopy(locale: Locale): LegalPage {
  return locale === "el" ? termsOfUseEl : termsOfUseEn;
}

// ── Privacy policy ──────────────────────────────────────────────────────────
//
// Translated from the English notice as it stands. Both language versions are
// still pending review by Greek counsel (audit item H-02) — translating it does
// not settle whether the English wording was right in the first place.

const privacyEn: LegalPage = {
  title: "Privacy Policy & Cookie Notice",
  intro: "Last updated: August 2026",
  sections: [
    {
      heading: "1. Who We Are",
      paragraphs: ["Anadyon Rentals is a vehicle rental company based at 20 Lomvardou Str. (Seafront Road, Zakynthos Town), 29100 Zakynthos, Greece. We are the data controller for the personal information collected through this website. You can reach us at {email} or by phone at +30 26950 41878."],
    },
    {
      heading: "2. What Data We Collect and Why",
      table: {
        headers: ["Data", "Purpose", "Legal basis (GDPR Art. 6)"],
        rows: [
          ["Name, email, phone", "Processing your rental quote and communicating about your booking", "Art. 6(1)(b) — contract performance"],
          ["Date of birth", "Verifying minimum driver age and applying applicable surcharges", "Art. 6(1)(b) — contract performance"],
          ["Address, postal code, city, country", "Issuing rental agreements and invoices", "Art. 6(1)(b) — contract performance"],
          ["Contact form message", "Responding to your enquiry", "Art. 6(1)(f) — legitimate interest"],
          ["Website usage data (via cookies)", "Analysing site traffic to improve our service (only with your consent)", "Art. 6(1)(a) — consent"],
        ],
      },
    },
    {
      heading: "3. Third-Party Processors",
      list: [
        "**Google Analytics** — used to analyse site traffic, only loaded after you give cookie consent. Data is processed by Google LLC (US). See {googlePrivacy}.",
        "**Google reCAPTCHA** — used on our booking and contact forms to prevent spam. Governed by Google's {googlePrivacy} and {googleTerms}.",
      ],
      after: [
        "We may also engage trusted third-party service providers to support the operation of this website, including services such as secure data hosting, transactional email delivery, and website infrastructure. These providers are contractually obligated to process personal data only on our instructions and in accordance with applicable data protection law.",
        "We do not sell your personal data to any third party.",
      ],
    },
    {
      heading: "4. Data Retention",
      paragraphs: ["Booking-related data is retained for 5 years from the date of your rental in accordance with Greek tax and commercial law. Contact enquiries not resulting in a booking are deleted after 12 months. You may request earlier deletion — see Section 6."],
    },
    {
      heading: "5. Cookies",
      paragraphs: ["We use the following cookies:"],
      table: {
        headers: ["Cookie", "Type", "Purpose"],
        mono: [0],
        rows: [
          ["cookie_consent", "Essential", "Stores your cookie preference (localStorage)"],
          ["_ga, _ga_*", "Analytics", "Google Analytics — only set with your consent"],
        ],
      },
      after: ["You can change or withdraw your cookie preference at any time using the “Cookie settings” link in the footer of every page, which reopens the panel above. Withdrawing is as easy as giving consent and takes effect immediately. Your choice is stored in your browser's local storage rather than in a cookie, so clearing site data for anadyon.gr also resets it."],
    },
    {
      heading: "6. Your Rights",
      paragraphs: ["Under the GDPR you have the right to:"],
      list: [
        "**Access** — request a copy of the personal data we hold about you (Art. 15)",
        "**Rectification** — ask us to correct inaccurate data (Art. 16)",
        "**Erasure** — ask us to delete your data where there is no overriding legal obligation to retain it (Art. 17)",
        "**Restriction** — ask us to restrict processing in certain circumstances (Art. 18)",
        "**Portability** — receive your data in a machine-readable format (Art. 20)",
        "**Object** — object to processing based on legitimate interest (Art. 21)",
        "**Withdraw consent** — withdraw cookie consent at any time without affecting prior processing",
      ],
      after: ["To exercise any of these rights, contact us at {email}. We will respond within 30 days. If you are not satisfied with our response, you have the right to lodge a complaint with the {hdpa}."],
    },
    {
      heading: "7. Changes to This Policy",
      paragraphs: ["We may update this policy from time to time. The “Last updated” date at the top of this page indicates when the most recent changes were made."],
    },
  ],
};

const privacyEl: LegalPage = {
  title: "Πολιτική Απορρήτου & Ενημέρωση για Cookies",
  intro: "Τελευταία ενημέρωση: Αύγουστος 2026",
  sections: [
    {
      heading: "1. Ποιοι Είμαστε",
      paragraphs: ["Η Anadyon Rentals είναι εταιρεία ενοικίασης οχημάτων με έδρα την οδό Λομβάρδου 20 (Παραλιακή Οδός, Πόλη Ζακύνθου), 29100 Ζάκυνθος, Ελλάδα. Είμαστε ο υπεύθυνος επεξεργασίας για τα προσωπικά δεδομένα που συλλέγονται μέσω του παρόντος ιστότοπου. Μπορείτε να επικοινωνήσετε μαζί μας στο {email} ή τηλεφωνικά στο +30 26950 41878."],
    },
    {
      heading: "2. Ποια Δεδομένα Συλλέγουμε και Γιατί",
      table: {
        headers: ["Δεδομένα", "Σκοπός", "Νομική βάση (ΓΚΠΔ Άρθρο 6)"],
        rows: [
          ["Ονοματεπώνυμο, email, τηλέφωνο", "Επεξεργασία της προσφοράς ενοικίασης και επικοινωνία σχετικά με την κράτησή σας", "Άρθρο 6(1)(β) — εκτέλεση σύμβασης"],
          ["Ημερομηνία γέννησης", "Επαλήθευση του ελάχιστου ορίου ηλικίας οδηγού και εφαρμογή τυχόν επιβαρύνσεων", "Άρθρο 6(1)(β) — εκτέλεση σύμβασης"],
          ["Διεύθυνση, ταχυδρομικός κώδικας, πόλη, χώρα", "Έκδοση συμφωνητικών ενοικίασης και τιμολογίων", "Άρθρο 6(1)(β) — εκτέλεση σύμβασης"],
          ["Μήνυμα φόρμας επικοινωνίας", "Απάντηση στο αίτημά σας", "Άρθρο 6(1)(στ) — έννομο συμφέρον"],
          ["Δεδομένα χρήσης ιστότοπου (μέσω cookies)", "Ανάλυση της επισκεψιμότητας για τη βελτίωση των υπηρεσιών μας (μόνο με τη συγκατάθεσή σας)", "Άρθρο 6(1)(α) — συγκατάθεση"],
        ],
      },
    },
    {
      heading: "3. Τρίτοι Εκτελούντες την Επεξεργασία",
      list: [
        "**Google Analytics** — χρησιμοποιείται για την ανάλυση της επισκεψιμότητας και φορτώνεται μόνο αφού δώσετε συγκατάθεση για cookies. Η επεξεργασία γίνεται από την Google LLC (ΗΠΑ). Δείτε την {googlePrivacy}.",
        "**Google reCAPTCHA** — χρησιμοποιείται στις φόρμες κράτησης και επικοινωνίας για την αποτροπή ανεπιθύμητων μηνυμάτων. Διέπεται από την {googlePrivacy} και τους {googleTerms} της Google.",
      ],
      after: [
        "Ενδέχεται επίσης να συνεργαζόμαστε με αξιόπιστους τρίτους παρόχους υπηρεσιών για την υποστήριξη της λειτουργίας του ιστότοπου, όπως ασφαλής φιλοξενία δεδομένων, αποστολή συναλλακτικών email και υποδομές ιστότοπου. Οι πάροχοι αυτοί δεσμεύονται συμβατικά να επεξεργάζονται προσωπικά δεδομένα αποκλειστικά βάσει των οδηγιών μας και σύμφωνα με την ισχύουσα νομοθεσία περί προστασίας δεδομένων.",
        "Δεν πωλούμε τα προσωπικά σας δεδομένα σε τρίτους.",
      ],
    },
    {
      heading: "4. Διατήρηση Δεδομένων",
      paragraphs: ["Τα δεδομένα που σχετίζονται με κρατήσεις διατηρούνται για 5 έτη από την ημερομηνία της ενοικίασης, σύμφωνα με την ελληνική φορολογική και εμπορική νομοθεσία. Τα αιτήματα επικοινωνίας που δεν καταλήγουν σε κράτηση διαγράφονται μετά από 12 μήνες. Μπορείτε να ζητήσετε νωρίτερη διαγραφή — δείτε την Ενότητα 6."],
    },
    {
      heading: "5. Cookies",
      paragraphs: ["Χρησιμοποιούμε τα ακόλουθα cookies:"],
      table: {
        headers: ["Cookie", "Τύπος", "Σκοπός"],
        mono: [0],
        rows: [
          ["cookie_consent", "Απαραίτητο", "Αποθηκεύει την προτίμησή σας για τα cookies (localStorage)"],
          ["_ga, _ga_*", "Analytics", "Google Analytics — ορίζεται μόνο με τη συγκατάθεσή σας"],
        ],
      },
      after: ["Μπορείτε να αλλάξετε ή να ανακαλέσετε την προτίμησή σας για τα cookies οποτεδήποτε, μέσω του συνδέσμου «Ρυθμίσεις cookies» στο υποσέλιδο κάθε σελίδας, ο οποίος επανεμφανίζει τον παραπάνω πίνακα. Η ανάκληση είναι εξίσου εύκολη με τη συγκατάθεση και ισχύει άμεσα. Η επιλογή σας αποθηκεύεται στην τοπική αποθήκευση (local storage) του προγράμματος περιήγησης και όχι σε cookie· η διαγραφή των δεδομένων του ιστότοπου την επαναφέρει επίσης."],
    },
    {
      heading: "6. Τα Δικαιώματά Σας",
      paragraphs: ["Βάσει του ΓΚΠΔ έχετε δικαίωμα:"],
      list: [
        "**Πρόσβασης** — να ζητήσετε αντίγραφο των προσωπικών δεδομένων που τηρούμε για εσάς (Άρθρο 15)",
        "**Διόρθωσης** — να ζητήσετε τη διόρθωση ανακριβών δεδομένων (Άρθρο 16)",
        "**Διαγραφής** — να ζητήσετε τη διαγραφή των δεδομένων σας, εφόσον δεν υπάρχει υπερισχύουσα νομική υποχρέωση διατήρησης (Άρθρο 17)",
        "**Περιορισμού** — να ζητήσετε τον περιορισμό της επεξεργασίας σε ορισμένες περιπτώσεις (Άρθρο 18)",
        "**Φορητότητας** — να λάβετε τα δεδομένα σας σε μορφή αναγνώσιμη από μηχάνημα (Άρθρο 20)",
        "**Εναντίωσης** — να αντιταχθείτε σε επεξεργασία που βασίζεται σε έννομο συμφέρον (Άρθρο 21)",
        "**Ανάκλησης συγκατάθεσης** — να ανακαλέσετε τη συγκατάθεση για cookies οποτεδήποτε, χωρίς να θίγεται η νομιμότητα της προηγούμενης επεξεργασίας",
      ],
      after: ["Για την άσκηση οποιουδήποτε από τα δικαιώματα αυτά, επικοινωνήστε μαζί μας στο {email}. Θα απαντήσουμε εντός 30 ημερών. Εάν δεν είστε ικανοποιημένοι με την απάντησή μας, έχετε δικαίωμα να υποβάλετε καταγγελία στην {hdpa}."],
    },
    {
      heading: "7. Αλλαγές στην Παρούσα Πολιτική",
      paragraphs: ["Ενδέχεται να επικαιροποιούμε την παρούσα πολιτική κατά διαστήματα. Η ένδειξη «Τελευταία ενημέρωση» στην κορυφή της σελίδας δηλώνει πότε έγιναν οι πιο πρόσφατες αλλαγές."],
    },
  ],
};

export function privacyCopy(locale: Locale): LegalPage {
  return locale === "el" ? privacyEl : privacyEn;
}
