import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Crimson_Pro, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { Footer } from "@/components/footer";
import { AccountLinks, HeaderSearch, LiveIndicator, NavLinks, NavList } from "@/components/nav";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme";
import { themeInitScript } from "@/lib/theme";

import "./globals.css";

const crimson = Crimson_Pro({ subsets: ["latin"], variable: "--font-crimson", weight: ["500", "600", "700"] });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], variable: "--font-atkinson", weight: ["400", "700"] });
const notoGujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  variable: "--font-noto-gujarati",
  weight: ["400", "600"],
  preload: false,
});
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  weight: ["400", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Virasat3D — India's living heritage archive", template: "%s · Virasat3D" },
  description:
    "Searchable, mapped and translated archive of Indian Knowledge Systems field research: stepwells, temples and crafts — handwritten notes read by AI, routes on an interactive atlas, and 3D digital twins.",
  applicationName: "Virasat3D",
};

export const viewport: Viewport = { themeColor: "#1e3a5f", width: "device-width", initialScale: 1 };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="Virasat3D home">
      <Image
        src="/logo.png"
        alt="Virasat3D cultural heritage logo"
        width={32}
        height={32}
        className="size-8 rounded object-contain"
        priority
      />
      <span className="font-serif text-xl font-semibold tracking-tight">Virasat3D</span>
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${crimson.variable} ${atkinson.variable} ${notoGujarati.variable} ${notoDevanagari.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-white px-3 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>
          <header className="sticky top-0 z-40 bg-[var(--color-nav-bg)] shadow-md">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
              <Logo />
              <nav aria-label="Primary" className="ml-2 hidden lg:block">
                <Suspense fallback={<NavList />}>
                  <NavLinks />
                </Suspense>
              </nav>
              <div className="ml-auto flex items-center gap-2 sm:gap-4">
                <HeaderSearch />
                <AccountLinks />
                <ThemeToggle />
                <LiveIndicator />
              </div>
            </div>
            <nav aria-label="Primary (compact)" className="scrollbar-none overflow-x-auto border-t border-white/10 px-2 py-1.5 lg:hidden">
              <Suspense fallback={<NavList className="w-max" />}>
                <NavLinks className="w-max" />
              </Suspense>
            </nav>
          </header>
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
