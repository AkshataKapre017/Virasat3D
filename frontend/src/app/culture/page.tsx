import type { Metadata } from "next";

import { CultureBrowser } from "@/components/culture/culture-browser";
import { CULTURE_COPY } from "@/lib/culture";

export const metadata: Metadata = {
  title: CULTURE_COPY.title,
  description: CULTURE_COPY.intro,
};

export default function CulturePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-4xl font-semibold">{CULTURE_COPY.title}</h1>
      <CultureBrowser />
    </div>
  );
}
