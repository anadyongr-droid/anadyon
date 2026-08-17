import type { Metadata } from "next";
import Image from "next/image";
import ContentPage from "../components/ContentPage";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides and tips for driving and exploring Zakynthos from Anadyon Rentals.",
  alternates: { canonical: "/blog" },
};


const posts = [
  {
    title: "Spring in Zakynthos",
    date: "30 March 2016",
    image: "/hero-zakynthos.jpg",
    excerpt:
      "The spring is here! Clear skies, 20°C, superb visibility, bright colours, blossomed trees and the unmistakable rejuvenation smell in the air. What more would you ask from your visit to Zakynthos, Il fiore di Levante? Rent a car, motorbike or bike from Anadyon Rentals and indulge in the spring wellbeing!",
    href: "/blog/spring-in-zakynthos",
  },
];

export default function Blog() {
  return (
    <ContentPage>
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Blog</h1>

        <div className="space-y-6">
          {posts.map(post => (
            <div key={post.href} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col sm:flex-row">
              <div className="relative w-full sm:w-56 h-48 sm:h-auto flex-shrink-0">
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{post.date}</p>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{post.title}</h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{post.excerpt}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
    </ContentPage>
  );
}
