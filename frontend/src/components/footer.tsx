import Link from "next/link";

import { NAV, SEARCH_HREF } from "@/lib/nav";

const footerLinks = [
  ...NAV.filter((item) => item.href === "/sites" || item.href === "/culture"),
  { href: SEARCH_HREF, label: "Search" },
  ...NAV.filter((item) => item.href === "/contribute"),
];

export function Footer() {
  return (
    <footer aria-label="Site footer" className="border-t border-ink/10 bg-sand text-ink-soft">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-sm">
          <Link href="/" className="font-serif text-lg font-semibold text-ink">
            Virasat3D
          </Link>
          <p className="mt-1 text-sm leading-snug text-muted">
            A searchable, mapped archive of India&apos;s living heritage.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-semibold">
            {footerLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-ink-soft underline-offset-2 transition-colors hover:text-terracotta hover:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-ink/10">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-xs leading-relaxed text-muted">
            Images from Wikimedia Commons contributors (CC BY / CC BY-SA, credited per item); basemap ©
            OpenStreetMap contributors; 3D models are educational reconstructions.
          </p>
        </div>
      </div>
    </footer>
  );
}
