import type { Metadata } from "next";
import { Suspense } from "react";

import { CultureBrowser } from "@/components/culture/culture-browser";
import { Skeleton } from "@/components/ui/primitives";
import { CULTURE_COPY } from "@/lib/culture";

export const metadata: Metadata = {
  title: CULTURE_COPY.title,
  description: CULTURE_COPY.intro,
};

function CultureSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index}>
          <Skeleton className="h-96" />
        </li>
      ))}
    </ul>
  );
}

export default function CulturePage() {
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-10">
      <h1 className="mb-6 text-4xl font-semibold">{CULTURE_COPY.title}</h1>
      <Suspense fallback={<CultureSkeleton />}>
        <CultureBrowser />
      </Suspense>
    </div>
  );
}
