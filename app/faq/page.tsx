"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ContentPage from "../components/ContentPage";

const faqs = [
  {
    q: "Do I need an International driver's licence?",
    a: "You don't need an International driver's licence if your driving permit is issued by an EU or EFTA country. For all other countries please contact us for more details. If your licence is printed in an alphabet other than Greek or Latin you would need to present an International licence.",
  },
  {
    q: "What is the minimum age to rent a car, motorbike or bike?",
    a: "To rent a car you need to be above 21 years. 18 years is the minimum age for motorbikes and bikes. A young driver surcharge may apply for drivers aged 21–25.",
  },
  {
    q: "Is there a daily/weekly limit on the miles/kilometres driven?",
    a: "No, unlimited mileage applies to all our rentals.",
  },
  {
    q: "Are taxes included on your rental fees?",
    a: "Yes, all taxes are already included on the rental fees we quote.",
  },
  {
    q: "Do you charge delivery/collection fees?",
    a: "All deliveries and collections (Airport, Zakynthos Port and our office) during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office.",
  },
  {
    q: "What do I need to do if my car/motorbike breaks down?",
    a: "Give us a call and stay where you are. We will come to assist you as soon as possible.",
  },
  {
    q: "What type of insurance is included in your standard fees?",
    a: "Our standard fees include Collision Damage Waiver (CDW), Theft insurance, and Third Party insurance.",
  },
  {
    q: "Do you offer any additional insurance?",
    a: "Yes, for an additional fee we offer Full Damage Waiver (FDW).",
  },
  {
    q: "If I buy all insurance packages, am I fully covered?",
    a: "The insurance does not cover damages to the bottom of the vehicle, wheels, tyres, mirrors, loss or theft of keys, windows and the interior of the vehicle.",
  },
  {
    q: "Are there any hidden extras I will need to pay?",
    a: "No hidden extras — our fees are all inclusive.",
  },
  {
    q: "What if I have to cancel my reservation?",
    a: "If you let us know more than 24 hours prior to the start date of the rental we will not charge any cancellation fee. In all other cases we will charge a day's rental.",
  },
  {
    q: "Can my partner/friend drive the car/motorbike too?",
    a: "Yes, you would just need to tell us at the start of the rental and pay the additional driver's fee.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <ContentPage>
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Frequently Asked Questions</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-10">
          Everything you need to know about renting with Anadyon. Can't find the answer?{" "}
          <a href="/contact" className="text-orange-600 dark:text-orange-400 hover:underline">Contact us</a>.
        </p>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-6 py-4 text-left font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span>{faq.q}</span>
                <ChevronDown
                  size={18}
                  className={`flex-shrink-0 ml-4 text-orange-500 dark:text-orange-400 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
    </ContentPage>
  );
}
