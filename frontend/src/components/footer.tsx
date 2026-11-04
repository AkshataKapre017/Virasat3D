"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FOOTER_COPY, FOOTER_LINK_GROUPS } from "@/lib/nav";

const footerLinkClass =
  "rounded-sm text-[var(--color-nav-text)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-nav-focus)]";

export function Footer() {
  const [year, setYear] = useState(2026);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer
      aria-label="Site footer"
      className="mt-auto bg-[var(--color-nav-bg)] text-[var(--color-nav-text)]"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-8">
        <div className="max-w-sm">
          <Link
            href="/"
            className={`${footerLinkClass} font-serif text-xl font-semibold`}
          >
            {FOOTER_COPY.brand}
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-nav-muted)]">
            {FOOTER_COPY.description}
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="grid gap-6 sm:grid-cols-2"
        >
          {FOOTER_LINK_GROUPS.map(({ label, links }) => (
            <div key={label}>
              <h2 className="mb-3 text-sm font-semibold text-[var(--color-nav-text)]">
                {label}
              </h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {links.map(({ href, footerLabel }) => (
                  <li key={href}>
                    <Link href={href} className={footerLinkClass}>
                      {footerLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-[var(--color-nav-border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-[var(--color-nav-muted)] sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>{FOOTER_COPY.copyright(year)}</p>
          <p>{FOOTER_COPY.imageCredits}</p>
        </div>
      </div>
    </footer>
  );
}