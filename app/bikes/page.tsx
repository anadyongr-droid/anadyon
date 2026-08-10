"use client";
import { useState } from "react";
import Image from "next/image";
import { User, Check } from "lucide-react";
import BookingForm from "../components/BookingForm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "Cinzia Bombi Retro Women",
    category: "City Bike — Women's",
    image: "https://img.cdn-cnj.si/img/250/250/VP/VPqgrd4FUPP.webp",
    gears: "3-speed Shimano Nexus",
    wheels: '26"',
    features: ["Step-through frame", "Mudguards & chain guard", "Rear luggage carrier"],
  },
  {
    name: "Cinzia Bombi Retro Men",
    category: "City Bike — Men's",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCtNFBtZQ36I0rOHc3r31n9DVm0Uz0w57Vope5vybMNfNvjILcqhjnjVw&s=10",
    gears: "3-speed Shimano Nexus",
    wheels: '28"',
    features: ["Classic steel frame", "Mudguards & chain guard", "Rear luggage carrier"],
  },
  {
    name: "Scott Sportster 50",
    category: "Trekking Bike — Women's",
    image: "https://static.cyclelab.eu/velos/scott/2007/highres/227820.jpg",
    gears: "21-speed Shimano",
    wheels: "700c",
    features: ["Lightweight aluminium frame", "Front suspension", "Flat handlebar"],
  },
  {
    name: "Ideal Crossmo",
    category: "Trekking Bike — Men's",
    image: "https://www.idealbikes.net/mocunab/2024/03/CROSSMO-M-ANTH-1920x1227.jpg",
    gears: "21-speed Shimano",
    wheels: '28"',
    features: ["Aluminium frame", "Shimano hydraulic disc brakes", "Front suspension"],
  },
  {
    name: "Kona Lanai",
    category: "Mountain Bike",
    image: "https://unitedbycycling.com/cdn/shop/products/KONA1.jpg?v=1768827305",
    gears: "21-speed Shimano",
    wheels: '27.5"',
    features: ["Aluminium frame", "Front suspension", "All-terrain tyres"],
  },
  {
    name: "KTM Manhattan XC",
    category: "Trekking Bike — Men's",
    image: "https://anadyon.gr/wp-content/uploads/ktm-manhattan1.jpeg",
    gears: "24-speed Shimano",
    wheels: '28"',
    features: ["Front suspension with lock", "Hydraulic disc brakes", "XLarge frame"],
  },
  {
    name: "Specialized Ariel",
    category: "Trekking Bike — Men's",
    image: "https://anadyon.gr/wp-content/uploads/Specialized.jpg",
    gears: "21-speed Shimano",
    wheels: "700c",
    features: ["Aluminium frame", "Front suspension", "Flat handlebar"],
  },
];

const placeholderColors: Record<string, string> = {
  "Cinzia Bombi Retro Women": "bg-rose-50",
  "Cinzia Bombi Retro Men": "bg-sky-50",
  "Specialized Ariel": "bg-yellow-50",
};

export default function Bikes() {
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
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Rent a Bike in Zakynthos</h1>

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
                    className="object-contain p-4"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">Photo coming soon</span>
                )}
              </div>

              <div className="hidden md:block w-px bg-gray-100 dark:bg-gray-700 my-6" />

              <div className="flex flex-col md:flex-row flex-1 p-6 gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{bike.name}</h3>
                  <Badge variant="secondary" className="mt-1 mb-4">{bike.category}</Badge>

                  <div className="flex flex-wrap gap-5 text-sm text-gray-600 dark:text-gray-200 mb-5">
                    <span className="text-sm text-gray-600 dark:text-gray-200">
                      {bike.gears}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User size={15} className="text-blue-600" />
                      1 rider
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
              vehicleType="Bikes"
              models={models.map((m) => m.name)}
              initialModel={selectedModel ?? models[0].name}
              modelPricingGroups={{
                "Cinzia Bombi Retro Women": "bike",
                "Cinzia Bombi Retro Men": "bike",
                "Scott Sportster 50": "bike",
                "Ideal Crossmo": "bike",
                "Kona Lanai": "bike",
                "KTM Manhattan XC": "bike",
                "Specialized Ariel": "bike",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
