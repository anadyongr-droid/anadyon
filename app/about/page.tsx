import type { Metadata } from "next";
import ContentPage, { ContentCard } from "../components/ContentPage";

export const metadata: Metadata = {
  title: "About Us | Anadyon Rentals Zakynthos",
  description: "Family-run vehicle rental company in Zakynthos since 2014. Cars, motorbikes and bikes — personal service, transparent pricing, no hidden fees.",
  alternates: { canonical: "https://anadyon.gr/about" },
};

export default function About() {
  return (
    <ContentPage>
      <div>
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">About Anadyon Vehicle Rentals</h1>

        <ContentCard className="space-y-5">

          <p>
            We are a car, motorbike and bike rental company located on the Island of Zakynthos, in the Ionian Islands, south-western Greece. We are based on the seafront road of Zakynthos Town where you can easily find us, talk to us and decide the best vehicle suited for your holidays in Zakynthos.
          </p>

          <p>
            Our goal is to provide you with high quality vehicles coupled with excellent service and competitive prices. Our rental fees are designed with simplicity in mind so that we make your vehicle rental as quick and easy as it gets.
          </p>

          <p>
            Our fleet consists of a variety of cars, motorbikes and bikes that you can pick up from multiple spots across the island — Zakynthos Airport, Zakynthos Port or our office located right in the centre of Zante Town.
          </p>

          <p>
            Rent a quality car, motorbike or bike at the best prices with Anadyon Rentals and enjoy your holidays in Zante Island care-free!
          </p>

          <p>
            For any additional information regarding vehicle reservations, terms & conditions or any other topic, please don&apos;t hesitate to{" "}
            <a href="/contact" className="text-orange-600 dark:text-orange-400 hover:underline font-medium">contact us</a>.
          </p>

        </ContentCard>
      </div>
    </ContentPage>
  );
}
