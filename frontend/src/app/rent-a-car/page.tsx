import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { RentACar } from "@/components/rent-a-car/rent-a-car";

export const metadata: Metadata = {
  title: "Rent a Car",
  description: "Tourist vehicle rates for Ahmedabad, Gandhinagar and outstation trips.",
};

export default function RentACarPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-ink hover:underline">
              Home
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight aria-hidden className="size-3.5" />
            <span aria-current="page" className="text-ink-soft">
              Rent a Car
            </span>
          </li>
        </ol>
      </nav>

      <h1 className="mb-6 text-4xl font-semibold">Rent a Car</h1>
      <RentACar />
    </div>
  );
}
