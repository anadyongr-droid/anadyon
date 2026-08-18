"use client";
import { useVehicleSelection } from "../hooks/useVehicleSelection";
import Image from "next/image";
import { User, Check } from "lucide-react";
import { GearStickIcon } from "../components/GearStickIcon";
import { EngineIcon } from "../components/EngineIcon";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "Kymco Agility 50cc",
    categoryKey: "cat.scooter",
    image: "/kymco-50cc.jpg",
    seats: 2,
    engine: "50cc",
    transmissionKey: "spec.automatic",
    featureKeys: ["feat.underseat", "feat.fuelEfficient", "feat.easyRide"],
    imagePadding: "p-4",
    whiteBg: true,
  },
  {
    name: "Kymco Agility 125cc",
    categoryKey: "cat.scooter",
    image: "/kymco-125cc.jpg",
    seats: 2,
    engine: "125cc",
    transmissionKey: "spec.automatic",
    featureKeys: ["feat.underseat", "feat.topBox", "feat.cbs", "feat.longerRides"],
    imagePadding: "p-4",
  },
];

export default function MotorbikesClient({ locale = "en" }: { locale?: Locale }) {
  const tr = translator(locale);
  const { selectedModel, formVisible, selectAndScroll } = useVehicleSelection();

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{tr("vehicles.motorbikesTitle")}</h1>

        <div className="space-y-5">
          {models.map((bike) => (
            <Card key={bike.name} className="overflow-hidden flex flex-col md:flex-row">
              <div className={`relative w-full md:w-72 h-52 md:h-auto flex-shrink-0 bg-white ${bike.whiteBg ? "" : "dark:bg-gray-800"}`}>
                <Image
                  src={bike.image}
                  alt={bike.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 288px"
                  quality={82}
                  className={`object-contain ${bike.imagePadding}`}
                />
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{bike.name}</h3>
                  <Badge variant="secondary" className="mt-1 mb-4">{tr(bike.categoryKey)}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="flex items-center gap-1.5">
                      <EngineIcon size={15} className="text-blue-600" />
                      {bike.engine}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GearStickIcon size={15} className="text-blue-600" />
                      {tr(bike.transmissionKey)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      {bike.seats} {tr("vehicles.seats")}
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
                    className="w-full md:w-36 bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-orange-700 transition text-sm"
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
              locale={locale}
              vehicleType="Motorbikes"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={{
                "Kymco Agility 50cc": "motorbike_a",
                "Kymco Agility 125cc": "motorbike_b",
              }}
              modelTransmissions={Object.fromEntries(models.map(m => [m.name, m.transmissionKey]))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
