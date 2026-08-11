"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Cars" },
  { href: "/motorbikes", label: "Motorbikes" },
  { href: "/bikes", label: "Bikes" },
  { href: "/about", label: "About Us" },
  { href: "/sights", label: "Zakynthos Sights" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
  { href: "/quote", label: "My Rental" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const [navLeft, setNavLeft] = useState(16);

  useEffect(() => {
    function measure() {
      if (logoRef.current) {
        const rect = logoRef.current.getBoundingClientRect();
        setNavLeft(rect.left);
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-40">
      {/* Logo row */}
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/" ref={logoRef}>
          <Image
            src="/logo.jpg"
            alt="Anadyon Rentals"
            width={270}
            height={80}
            className="object-contain"
          />
        </a>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-gray-700 dark:text-gray-300"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop nav */}
      <nav className="hidden md:block bg-orange-600 dark:bg-orange-700 w-full">
        <div
          className="flex"
          style={{ paddingLeft: navLeft, paddingRight: 160 }}
        >
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              className="flex-1 text-center text-sm font-semibold text-white py-3 hover:bg-orange-700 dark:hover:bg-orange-700 transition border-r border-orange-500 dark:border-orange-700 last:border-r-0"
            >
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-3">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 visited:text-gray-700 dark:visited:text-gray-300 py-1"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
