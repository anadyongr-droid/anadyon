const sections = [
  {
    title: "Rent a Car in Zakynthos",
    links: [
      { href: "/cars", label: "All Cars" },
    ],
  },
  {
    title: "Rent a Motorbike in Zakynthos",
    links: [
      { href: "/motorbikes", label: "All Motorbikes" },
    ],
  },
  {
    title: "Rent a Bike in Zakynthos",
    links: [
      { href: "/bikes", label: "All Bikes" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/sights", label: "Zakynthos Sights" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Information",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/terms-of-use", label: "Terms of Use" },
      { href: "/contact", label: "Contact Us" },
    ],
  },
];

export default function Sitemap() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Sitemap</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-10">
          Find all pages on the Anadyon Rentals website. For any additional information please{" "}
          <a href="/contact" className="text-orange-600 dark:text-orange-400 hover:underline">contact us</a>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {sections.map(section => (
            <div key={section.title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{section.title}</h2>
              <ul className="space-y-2">
                {section.links.map(link => (
                  <li key={link.href}>
                    <a href={link.href} className="text-orange-600 dark:text-orange-400 hover:underline text-sm">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
