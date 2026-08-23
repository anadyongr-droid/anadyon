"use client";
import { useVehicleSelection } from "../hooks/useVehicleSelection";
import Image from "next/image";
import { User, Check } from "lucide-react";
import type { Rate, ExtrasConfig } from "@/lib/pricing";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { pricingGroupsForType } from "@/lib/vehicleCatalogue";

const models = [
  {
    name: "Cinzia Bombi Retro Women",
    categoryKey: "cat.cityWomen",
    image: "/bottecchia.webp",
    gears: "spec.gears3",
    wheels: '26"',
    featureKeys: ["feat.stepThrough", "feat.mudguards", "feat.carrier"],
  },
  {
    name: "Cinzia Bombi Retro Men",
    categoryKey: "cat.cityMen",
    image: "/giant-bike.jpg",
    gears: "spec.gears3",
    wheels: '28"',
    featureKeys: ["feat.steelFrame", "feat.mudguards", "feat.carrier"],
  },
  {
    name: "Scott Sportster 50",
    categoryKey: "cat.trekkingWomen",
    image: "/scott-bike.jpg",
    gears: "spec.gears21",
    wheels: "700c",
    featureKeys: ["feat.lightAlu", "feat.frontSusp", "feat.flatBar"],
  },
  {
    name: "Ideal Crossmo",
    categoryKey: "cat.trekkingMen",
    image: "/crossmo-bike.jpg",
    gears: "spec.gears21",
    wheels: '28"',
    featureKeys: ["feat.aluFrame", "feat.shimanoDisc", "feat.frontSusp"],
  },
  {
    name: "Kona Lanai",
    categoryKey: "cat.mountain",
    image: "/kona-bike.jpg",
    gears: "spec.gears21",
    wheels: '27.5"',
    featureKeys: ["feat.aluFrame", "feat.frontSusp", "feat.allTerrain"],
  },
  {
    name: "KTM Manhattan XC",
    categoryKey: "cat.trekkingMen",
    image: "/ktm-manhattan.jpeg",
    gears: "spec.gears24",
    wheels: '28"',
    featureKeys: ["feat.frontSuspLock", "feat.hydraulicDisc", "feat.xlFrame"],
  },
  {
    name: "Specialized Ariel",
    categoryKey: "cat.trekkingMen",
    image: "/specialized.jpg",
    gears: "spec.gears21",
    wheels: "700c",
    featureKeys: ["feat.aluFrame", "feat.frontSusp", "feat.flatBar"],
  },
];

const placeholderColors: Record<string, string> = {
  "Cinzia Bombi Retro Women": "bg-rose-50",
  "Cinzia Bombi Retro Men": "bg-sky-50",
  "Specialized Ariel": "bg-yellow-50",
};

export default function BikesClient({ locale = "en", initialRates, initialExtras }: {
  locale?: Locale;
  /** Rate card read on the server, so the booking form opens with prices. */
  initialRates?: Rate[];
  initialExtras?: ExtrasConfig[];
}) {
  const tr = translator(locale);
  const { selectedModel, formVisible, selectAndScroll } = useVehicleSelection();

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{tr("vehicles.bikesTitle")}</h1>

        <div className="space-y-5">
          {models.map((bike) => (
            <Card key={bike.name} className="overflow-hidden flex flex-col md:flex-row">
              <div
                className={`relative w-full md:w-72 h-52 md:h-auto flex-shrink-0 ${
                  bike.image ? "bg-white dark:bg-gray-800" : (placeholderColors[bike.name] ?? "bg-gray-100")
                } flex items-center justify-center`}
              >
                {bike.image ? (
                  <Image
                    src={bike.image}
                    alt={bike.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 288px"
                    quality={82}
                    className="object-contain p-4"
                  />
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 text-sm">{tr("spec.photoSoon")}</span>
                )}
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  {/* h2, not h3: these sit directly under the page h1, and a screen
                      reader navigating by heading hears a level skipped otherwise. */}
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{bike.name}</h2>
                  <Badge variant="secondary" className="mt-1 mb-4">{tr(bike.categoryKey)}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="text-sm text-gray-600 dark:text-gray-200">
                      {tr(bike.gears)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      1 {tr("vehicles.rider")}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {bike.featureKeys.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <Check size={14} className="text-green-500 flex-shrink-0" />
                        {tr(f)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-end">
                  <button
                    onClick={() => selectAndScroll(bike.name)}
                    className="w-full md:w-36 bg-orange-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-orange-800 transition text-sm"
                  >
                    {tr("vehicles.getQuote")}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {formVisible && (
          <div id="booking-form" className="mt-12 scroll-mt-[168px]">
            <BookingForm
                initialRates={initialRates}
                initialExtras={initialExtras}
              locale={locale}
              vehicleType="Bikes"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={pricingGroupsForType("Bikes")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
