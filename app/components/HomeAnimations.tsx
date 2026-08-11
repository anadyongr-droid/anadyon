"use client";
import { motion, type Variants } from "framer-motion";
import Image from "next/image";
import { CheckCircle, MapPin, Headphones, Shield } from "lucide-react";

const benefits = [
  { icon: CheckCircle, title: "Unlimited Mileage", desc: "Drive as far as you want with no extra charges" },
  { icon: MapPin, title: "Free Delivery", desc: "Free delivery & collection during office hours*" },
  { icon: Shield, title: "All Taxes Included", desc: "No hidden fees — price is what you pay" },
  { icon: Headphones, title: "24h Road Assistance", desc: "We're always available if you need us" },
];

const fleet = [
  {
    name: "Cars",
    desc: "Economy cars perfect for exploring the island",
    href: "/cars",
    image: "https://anadyon.gr/wp-content/uploads/anadyon-car-rentals-zakynthos-hyundai-i20-01-300x179.jpg",
  },
  {
    name: "Motorbikes",
    desc: "Scooters for zipping around Zakynthos",
    href: "/motorbikes",
    image: "/kymco-50cc-fleet.png",
  },
  {
    name: "Bikes",
    desc: "City, trekking and mountain bikes",
    href: "/bikes",
    image: "https://anadyon.gr/wp-content/uploads/ktm-manhattan1.jpeg",
  },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export function Benefits() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {benefits.map((b, i) => (
          <motion.div
            key={b.title}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="flex flex-col items-center text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl"
          >
            <b.icon size={32} className="text-blue-600 mb-3" />
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">{b.title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{b.desc}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
        * Delivery & collection conditions apply. See our{" "}
        <a href="/faq" className="underline hover:text-gray-600 dark:hover:text-gray-300">FAQ</a>{" "}
        for details.
      </p>
    </div>
  );
}

export function Fleet() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 py-12 md:py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">Our Fleet</h2>
        <p className="text-center text-gray-500 dark:text-gray-400 mb-10">Choose your ride and discover the island</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {fleet.map((v, i) => (
            <motion.a
              key={v.name}
              href={v.href}
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
                  alt={v.name}
                  fill
                  className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-5 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{v.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">{v.desc}</p>
                <span className="text-blue-700 dark:text-blue-400 text-sm font-semibold">View fleet →</span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WhyAnadyon() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Why Choose Anadyon?</h2>
        <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 mb-2">Family-run since 2014</p>
        <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-8">
          We know Zakynthos inside out. Our team is dedicated to making your rental experience as smooth as possible — from the moment you land to the moment you leave.
        </p>
      </motion.div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {[
          { title: "Local Expertise", desc: "We know every road, beach and sight on the island. Ask us anything." },
          { title: "Transparent Pricing", desc: "No surprises. All taxes, CDW and unlimited mileage are included." },
          { title: "Personal Service", desc: "You deal directly with us — not a call centre. We pick up the phone." },
        ].map((item, i) => (
          <motion.div
            key={item.title}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700"
          >
            <h3 className="font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
