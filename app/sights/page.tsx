import Image from "next/image";
import ContentPage from "../components/ContentPage";

const sights = [
  {
    name: "The Shipwreck Beach (Navagio)",
    desc: "The landmark of the island and one of the best awarded beaches worldwide — you just have to visit! Also known as Smuggler's Wreck, it is only accessible by boat.",
    image: "/hero-zakynthos.jpg",
  },
  {
    name: "Blue Caves",
    desc: "Rent a boat or join a cruise to swim in the deep blue waters of the Blue Caves, located on the north-east part of the island. Corals on the rocks and the sea bottom give an amazing crystal blue colour to the water inside the caves.",
    image: null,
  },
  {
    name: "Marathonissi Island (Turtle Island) & Keri Caves",
    desc: "A small tropical isle just a few minutes from the village of Keri, in the south-western part of Zante. Rent a boat or join a cruise. Keri Caves with their unique rock formations and hidden private beach caves are waiting for you to explore.",
    image: null,
  },
  {
    name: "Scenic Sunsets on the West-Side Cliffs",
    desc: "Don't miss the sunset from one of the many spots on the west side of the island: Keri Lighthouse, Porto Roxa, Limnionas or Kampi. The colours of the horizon during an Ionian sunset will enchant you.",
    image: null,
  },
  {
    name: "National Marine Park of Zakynthos",
    desc: "The Park covers multiple beaches around Laganas Bay on the south side of the island: Daphne, Gerakas, Sekania, Kalamaki, Laganas, Agios Sostis, Porto Koukla and Keri Lake. Rent a boat or go snorkelling to swim with the protected Loggerhead Sea Turtle (Caretta-Caretta).",
    image: "/zakynthos-turtles.jpg",
  },
  {
    name: "Zakynthos Town",
    desc: "Stroll around the alleys of Zakynthos Town, taste and buy traditional local products such as Mantolato, Mantoles and Fitoura. Visit the grand church of St. Dionysios, the Byzantine Museum and the Dionysios Solomos Museum, hosting the mausoleums of two of Greece's most important poets.",
    image: "/zakynthos-town.jpg",
  },
];

export default function Sights() {
  return (
    <ContentPage>
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Zakynthos Sights</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-10 leading-relaxed">
          Welcome to Zakynthos! Also known as Zante, this majestic Greek island sits on the south-west of the Ionian Sea.
          Tropical beaches with crystal clear turquoise waters, lush vegetation and the warm character of the locals make it the ideal summer destination.
          Many hidden treasures are waiting for you — and the best way to explore them is with your own wheels.
        </p>

        <div className="space-y-5">
          {sights.map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {s.image && (
                <div className="relative w-full h-56">
                  <Image
                    src={s.image}
                    alt={s.name}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{s.name}</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-6">
          <p className="text-base font-semibold mb-2 text-gray-900 dark:text-white">Explore Zakynthos with Anadyon Rentals</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Rent a <a href="/cars" className="text-orange-600 dark:text-orange-400 hover:underline">car</a>,{" "}
            <a href="/motorbikes" className="text-orange-600 dark:text-orange-400 hover:underline">motorbike</a> or{" "}
            <a href="/bikes" className="text-orange-600 dark:text-orange-400 hover:underline">bike</a> and make your holidays in Zakynthos an unforgettable experience!
          </p>
        </div>
    </ContentPage>
  );
}
