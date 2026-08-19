"use client";
import Image from "next/image";
import ContentPage from "../components/ContentPage";
import { posts as postsFor, BLOG_TITLE } from "@/lib/i18n/content/pages";
import type { Locale } from "@/lib/i18n";

export default function BlogClient({ locale = "en" }: { locale?: Locale }) {
  const posts = postsFor(locale);

  return (
    <ContentPage>
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{BLOG_TITLE[locale]}</h1>

      <div className="space-y-6">
        {posts.map(post => (
          <div key={post.href} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col sm:flex-row">
            <div className="relative w-full sm:w-56 h-48 sm:h-auto flex-shrink-0">
              <Image
                src={post.image}
                alt={post.title}
                fill
                sizes="(max-width: 640px) 100vw, 224px"
                quality={82}
                className="object-cover"
              />
            </div>
            <div className="p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{post.date}</p>
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
