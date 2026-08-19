"use client";
import { motion, type Variants } from "framer-motion";
import Image from "next/image";
import { CheckCircle, MapPin, Headphones, Shield } from "lucide-react";
import { translator, localePath, type Locale } from "@/lib/i18n";

const benefits = [
  { icon: CheckCircle, key: "mileage" },
  { icon: MapPin,      key: "delivery" },
  { icon: Shield,      key: "taxes" },
  { icon: Headphones,  key: "assistance" },
];

const fleet = [
  { key: "cars",       path: "/cars",       image: "/hyundai-i20.jpg" },
  { key: "motorbikes", path: "/motorbikes", image: "/kymco-50cc-fleet.jpg" },
  { key: "bikes",      path: "/bikes",      image: "/ktm-manhattan.jpeg" },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export function Benefits({ locale = "en" }: { locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
      {/*
        The four cards below are h3s, and this block sits directly under the
        page h1 with nothing between — so someone navigating by heading hears a
        level skipped, and has no idea what the four cards belong to.

        Hidden visually rather than shown: the section reads perfectly well
        sighted without a title, and adding a visible one would change the
        design. A screen reader now announces the group before its contents.
      */}
      <h2 className="sr-only">{tr("benefit.sectionTitle")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {benefits.map((b, i) => (
          <motion.div
            key={b.key}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="flex flex-col items-center text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl"
          >
            <b.icon size={32} className="text-orange-500 mb-3" />
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">{tr(`benefit.${b.key}`)}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tr(`benefit.${b.key}Desc`)}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
        {tr("benefit.footnote")}{" "}
        <a href={localePath("/faq", locale)} className="underline hover:text-gray-600 dark:hover:text-gray-300">{tr("benefit.footnoteFaq")}</a>{" "}
        {tr("benefit.footnoteEnd")}
      </p>
    </div>
  );
}

export function Fleet({ locale = "en" }: { locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="bg-gray-50 dark:bg-gray-900 py-12 md:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">{tr("fleet.title")}</h2>
        <p className="text-center text-gray-500 dark:text-gray-400 mb-10">{tr("fleet.subtitle")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {fleet.map((v, i) => (
            <motion.a
              key={v.key}
              href={localePath(v.path, locale)}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={fadeUp}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition overflow-hidden group border border-gray-100 dark:border-gray-700"
            >
              <div className="relative h-48 bg-white dark:bg-gray-800">
                <Image
                  src={v.image}
                  alt={tr(`fleet.${v.key}`)}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  quality={82}
                  className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-5 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{tr(`fleet.${v.key}`)}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{tr(`fleet.${v.key}Desc`)}</p>
                <p className="text-xs text-orange-700 dark:text-orange-400 font-medium mb-3">{tr(`fleet.${v.key}Best`)}</p>
                <span className="text-orange-700 dark:text-orange-400 text-sm font-semibold">{tr("fleet.view")}</span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WhyAnadyon({ locale = "en" }: { locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{tr("why.title")}</h2>
        <p className="text-lg font-semibold text-orange-700 dark:text-orange-400 mb-2">{tr("why.tagline")}</p>
        <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-8">
          {tr("why.intro")}
        </p>
      </motion.div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {["local", "pricing", "service"].map((item, i) => (
          <motion.div
            key={item}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700"
          >
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">{tr(`why.${item}`)}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tr(`why.${item}Desc`)}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
