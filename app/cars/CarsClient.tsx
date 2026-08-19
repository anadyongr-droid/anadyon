"use client";
import { useVehicleSelection } from "../hooks/useVehicleSelection";
import Image from "next/image";
import { User, Briefcase, Check } from "lucide-react";
import { GearStickIcon } from "../components/GearStickIcon";
import { CarDoorIcon } from "../components/CarDoorIcon";
import type { Rate, ExtrasConfig } from "@/lib/pricing";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "Fiat Panda",
    categoryKey: "cat.economy",
    image: "/fiat-panda.jpg",
    seats: 5,
    doors: 5,
    luggage: 225,
    transmissionKey: "spec.manual",
    featureKeys: ["feat.ac", "feat.abs", "feat.bag1"],
  },
  {
    name: "Hyundai Getz",
    categoryKey: "cat.economy",
    image: "/hyundai-getz.jpg",
    seats: 5,
    doors: 5,
    luggage: 288,
    transmissionKey: "spec.manual",
    featureKeys: ["feat.ac", "feat.abs", "feat.bag1"],
  },
  {
    name: "Hyundai i10",
    categoryKey: "cat.economy",
    image: "/hyundai-i10.jpg",
    seats: 5,
    doors: 5,
    luggage: 252,
    transmissionKey: "spec.manual",
    featureKeys: ["feat.ac", "feat.abs", "feat.bag1"],
  },
  {
    name: "Hyundai i20",
    categoryKey: "cat.compact",
    image: "/hyundai-i20.jpg",
    seats: 5,
    doors: 5,
    luggage: 311,
    transmissionKey: "spec.manual",
    featureKeys: ["feat.ac", "feat.abs", "feat.bag2"],
  },
  {
    name: "Peugeot 107",
    categoryKey: "cat.automatic",
    image: "/peugeot-107.jpg",
    seats: 4,
    doors: 5,
    luggage: 139,
    transmissionKey: "spec.automatic",
    featureKeys: ["feat.ac", "feat.abs", "feat.autoGearbox"],
  },
];

export default function CarsClient({ locale = "en", initialRates, initialExtras }: {
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
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{tr("vehicles.carsTitle")}</h1>

        <div className="space-y-5">
          {models.map((car) => (
            <Card key={car.name} className="overflow-hidden flex flex-col md:flex-row">
              <div className="relative w-full md:w-72 h-52 md:h-auto flex-shrink-0 bg-white dark:bg-gray-800">
                {/* sizes is required alongside `fill`: without it Next.js assumes
                    100vw and the browser fetches the widest variant in the srcset
                    for a card that is only 288px across. */}
                <Image
                  src={car.image}
                  alt={car.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 288px"
                  quality={82}
                  className="object-contain p-4"
                />
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  {/* h2, not h3: these sit directly under the page h1, and a screen
                      reader navigating by heading hears a level skipped otherwise. */}
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{car.name}</h2>
                  <Badge variant="secondary" className="mt-1 mb-4">{tr(car.categoryKey)}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="flex items-center gap-1.5">
                      <GearStickIcon size={15} className="text-blue-600" />
                      {tr(car.transmissionKey)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      {car.seats} {tr("vehicles.seats")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CarDoorIcon size={15} className="text-blue-600" />
                      {car.doors} {tr("vehicles.doors")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Briefcase size={15} className="text-blue-600" />
                      {car.luggage} {tr("vehicles.litres")}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {car.featureKeys.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <Check size={14} className="text-green-500 flex-shrink-0" />
                        {tr(f)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-end md:justify-end gap-3">
                  <button
                    onClick={() => selectAndScroll(car.name)}
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
              vehicleType="Cars"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={{
                "Fiat Panda": "car_a",
                "Hyundai Getz": "car_a",
                "Hyundai i10": "car_a",
                "Hyundai i20": "car_b",
                "Peugeot 107": "car_c",
              }}
              modelTransmissions={Object.fromEntries(models.map(m => [m.name, m.transmissionKey]))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
