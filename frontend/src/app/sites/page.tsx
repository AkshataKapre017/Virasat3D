import type { Metadata } from "next";

import { SiteGrid } from "@/components/site/site-grid";

export const metadata: Metadata = {
  title: "Heritage sites",
  description: "Stepwells, temples, forts and craft clusters documented in the field archive.",
};

export default function SitesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-4xl font-semibold">Heritage sites</h1>
      <SiteGrid />
    </div>
  );
}
