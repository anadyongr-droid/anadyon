"use client";
import { useVehicleSelection } from "../hooks/useVehicleSelection";
import Image from "next/image";
import { User, Briefcase, Check } from "lucide-react";
import { GearStickIcon } from "../components/GearStickIcon";
import { CarDoorIcon } from "../components/CarDoorIcon";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "Fiat Panda",
    category: "Economy Car",
    image: "/fiat-panda.jpg",
    seats: 5,
    doors: 5,
    luggage: "225 lt.",
    transmission: "Manual",
    features: ["A/C", "ABS", "1 large + 1 small bag"],
  },
  {
    name: "Hyundai Getz",
    category: "Economy Car",
    image: "/hyundai-getz.jpg",
    seats: 5,
    doors: 5,
    luggage: "288 lt.",
    transmission: "Manual",
    features: ["A/C", "ABS", "1 large + 1 small bag"],
  },
  {
    name: "Hyundai i10",
    category: "Economy Car",
    image: "/hyundai-i10.jpg",
    seats: 5,
    doors: 5,
    luggage: "252 lt.",
    transmission: "Manual",
    features: ["A/C", "ABS", "1 large + 1 small bag"],
  },
  {
    name: "Hyundai i20",
    category: "Compact Car",
    image: "/hyundai-i20.jpg",
    seats: 5,
    doors: 5,
    luggage: "311 lt.",
    transmission: "Manual",
    features: ["A/C", "ABS", "2 large bags"],
  },
];

export default function Cars() {
  const { selectedModel, formVisible, selectAndScroll } = useVehicleSelection();

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Rent a Car in Zakynthos</h1>

        <div className="space-y-5">
          {models.map((car) => (
            <Card key={car.name} className="overflow-hidden flex flex-col md:flex-row">
              <div className="relative w-full md:w-72 h-52 md:h-auto flex-shrink-0 bg-white dark:bg-gray-800">
                <Image
                  src={car.image}
                  alt={car.name}
                  fill
                  className="object-contain p-4"
                />
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{car.name}</h3>
                  <Badge variant="secondary" className="mt-1 mb-4">{car.category}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="flex items-center gap-1.5">
                      <GearStickIcon size={15} className="text-blue-600" />
                      {car.transmission}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      {car.seats} seats
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CarDoorIcon size={15} className="text-blue-600" />
                      {car.doors} doors
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Briefcase size={15} className="text-blue-600" />
                      {car.luggage}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {car.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <Check size={14} className="text-green-500 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-end md:justify-end gap-3">
                  <button
                    onClick={() => selectAndScroll(car.name)}
                    className="w-full md:w-36 bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-orange-700 transition text-sm"
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
              vehicleType="Cars"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={{
                "Fiat Panda": "car_a",
                "Hyundai Getz": "car_a",
                "Hyundai i10": "car_a",
                "Hyundai i20": "car_b",
              }}
              modelTransmissions={Object.fromEntries(models.map(m => [m.name, m.transmission]))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
