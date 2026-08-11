import Image from "next/image";
import { Benefits, Fleet, WhyAnadyon } from "./components/HomeAnimations";

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <div className="relative bg-orange-600 text-white overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://anadyon.gr/wp-content/uploads/anadyon-car-rental-agency-zakynthos-01.jpg"
            alt="Zakynthos Shipwreck Beach"
            fill
            className="object-cover opacity-60"
            priority
          />
        </div>
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-28 flex flex-col items-center text-center relative z-10">
          <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            Explore Zakynthos<br />Your Way
          </h1>
          <p className="text-base md:text-xl mb-8 text-orange-100 max-w-xl">
            Car, motorbike and bike rentals in Zakynthos
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/cars" className="bg-white text-orange-600 font-semibold px-8 py-3 rounded-full hover:bg-orange-50 transition">
              Rent a Car
            </a>
            <a href="/motorbikes" className="bg-white text-orange-600 font-semibold px-5 py-3 rounded-full hover:bg-orange-50 transition">
              Rent a Motorbike
            </a>
            <a href="/bikes" className="bg-white text-orange-600 font-semibold px-8 py-3 rounded-full hover:bg-orange-50 transition">
              Rent a Bike
            </a>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" fill="white" className="dark:fill-gray-950"/>
          </svg>
        </div>
      </div>

      <Benefits />
      <Fleet />
      <WhyAnadyon />

      {/* CTA Banner */}
      <div className="bg-orange-600 text-white py-14 px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to explore Zakynthos?</h2>
        <p className="text-orange-100 mb-8">Get a quote in minutes — no commitment required</p>
        <a href="/cars" className="bg-white text-orange-600 font-semibold px-10 py-3 rounded-full hover:bg-orange-50 transition">
          Get a Quote
        </a>
      </div>
    </div>
  );
}
