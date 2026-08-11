"use client";
import { useState } from "react";
import Image from "next/image";
import { User, Check } from "lucide-react";
import { GearStickIcon } from "../components/GearStickIcon";
import { EngineIcon } from "../components/EngineIcon";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "Kymco Agility 50cc",
    category: "Scooter",
    image: "/kymco-50cc.png",
    seats: 2,
    engine: "50cc",
    transmission: "Automatic",
    features: ["Underseat storage", "Fuel efficient", "Easy to ride"],
    imagePadding: "p-4",
    whiteBg: true,
  },
  {
    name: "Kymco Agility 125cc",
    category: "Scooter",
    image: "/kymco-125cc.jpg",
    seats: 2,
    engine: "125cc",
    transmission: "Automatic",
    features: ["Underseat storage", "CBS brakes", "Suitable for longer rides"],
    imagePadding: "p-4",
  },
];

export default function Motorbikes() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  function selectAndScroll(name: string) {
    setSelectedModel(name);
    setFormVisible(true);
    setTimeout(() => {
      document.getElementById("booking-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Rent a Motorbike in Zakynthos</h1>

        <div className="space-y-5">
          {models.map((bike) => (
            <Card key={bike.name} className="overflow-hidden flex flex-col md:flex-row">
              <div className={`relative w-full md:w-72 h-52 md:h-auto flex-shrink-0 bg-white ${bike.whiteBg ? "" : "dark:bg-gray-800"}`}>
                <Image
                  src={bike.image}
                  alt={bike.name}
                  fill
                  className={`object-contain ${bike.imagePadding}`}
                />
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{bike.name}</h3>
                  <Badge variant="secondary" className="mt-1 mb-4">{bike.category}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="flex items-center gap-1.5">
                      <EngineIcon size={15} className="text-blue-600" />
                      {bike.engine}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GearStickIcon size={15} className="text-blue-600" />
                      {bike.transmission}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      {bike.seats} seats
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {bike.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <Check size={14} className="text-green-500 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-end">
                  <button
                    onClick={() => selectAndScroll(bike.name)}
                    className="w-full md:w-36 bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-800 transition text-sm"
                  >
                    Get Quote
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {formVisible && (
          <div id="booking-form" className="mt-12 scroll-mt-[168px]">
            <BookingForm
              vehicleType="Motorbikes"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={{
                "Kymco Agility 50cc": "motorbike_a",
                "Kymco Agility 125cc": "motorbike_b",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
