"use client";
import Image from "next/image";
import { translator, localePath, type Locale } from "@/lib/i18n";
import { Benefits, Fleet, WhyAnadyon } from "./HomeAnimations";

export default function Home({ locale = "en" }: { locale?: Locale }) {
  const tr = translator(locale);
  const href = (p: string) => localePath(p, locale);
  return (
    <div>
      {/* Hero */}
      <div className="relative bg-gray-900 text-white overflow-hidden -mb-px">
        <div className="absolute inset-0 z-0">
          <Image
            src="/hero-zakynthos.jpg"
            alt="Zakynthos Shipwreck Beach"
            fill
            sizes="100vw"
            quality={82}
            className="object-cover opacity-95"
            priority
          />
          {/* dark gradient so text stays readable without colour-tinting the photo */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-transparent" />
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" fill="white" className="dark:fill-gray-950"/>
          </svg>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-28 flex flex-col items-center text-center relative z-10">
          <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            {tr("home.title")}
          </h1>
          <p className="text-base md:text-xl mb-8 text-white max-w-xl">
            {tr("home.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center w-full sm:w-auto">
            <a href={href("/cars")} className="bg-white text-orange-700 font-semibold px-8 py-3 rounded-full hover:bg-orange-50 transition text-center">
              {tr("home.rentCar")}
            </a>
            <a href={href("/motorbikes")} className="bg-white text-orange-700 font-semibold px-8 py-3 rounded-full hover:bg-orange-50 transition text-center">
              {tr("home.rentMotorbike")}
            </a>
            <a href={href("/bikes")} className="bg-white text-orange-700 font-semibold px-8 py-3 rounded-full hover:bg-orange-50 transition text-center">
              {tr("home.rentBike")}
            </a>
          </div>

          {/* Trust strip */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-7 text-sm text-white/80">
            <span>✓ {tr("home.familyRun")}</span>
            <span>✓ {tr("home.personalService")}</span>
            <span>✓ {tr("home.noHiddenFees")}</span>
          </div>

          {/* How it works */}
          <div className="flex items-center gap-2 mt-5 text-xs text-white/60 font-medium tracking-wide uppercase whitespace-nowrap">
            <span>{tr("home.stepQuote")}</span>
            <span>→</span>
            <span>{tr("home.stepConfirm")}</span>
            <span>→</span>
            <span>{tr("home.stepPickup")}</span>
          </div>
        </div>
      </div>

      <Benefits locale={locale} />
      <Fleet locale={locale} />
      <WhyAnadyon locale={locale} />

      {/* CTA Banner */}
      <div className="bg-orange-700 text-white py-14 px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">{tr("cta.ready")}</h2>
        <p className="text-orange-100 mb-8">{tr("cta.sub")}</p>
        <a href={href("/cars")} className="bg-white text-orange-700 font-semibold px-10 py-3 rounded-full hover:bg-orange-50 transition">
          {tr("cta.button")}
        </a>
      </div>
    </div>
  );
}
