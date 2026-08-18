import type { Metadata } from "next";
import SightsContent from "../../sights/SightsContent";

export const metadata: Metadata = {
  title: "Αξιοθέατα Ζακύνθου",
  description: "Ναυάγιο, Γαλάζιες Σπηλιές, Κερί και πολλά ακόμη — πού να πάτε στη Ζάκυνθο και πώς να φτάσετε με αυτοκίνητο, μηχανή ή ποδήλατο.",
  alternates: { canonical: "/el/sights", languages: { en: "/sights", el: "/el/sights" } },
};

export default function Page() {
  return <SightsContent locale="el" />;
}
