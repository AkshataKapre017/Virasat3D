"use client";

import { Clock3, ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/ui/primitives";
import type { CultureCategoryOption, CultureItem } from "@/lib/api/types";
import { CULTURE_COPY, cultureCategoryLabel, cultureCreditLine } from "@/lib/culture";

export function CultureCard({
  item,
  categories,
}: {
  item: CultureItem;
  categories: readonly CultureCategoryOption[];
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : item.image_url;
  const credit = cultureCreditLine(item);

  return (
    <article className="card group flex h-full w-full min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-sand">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            role="img"
            aria-label={item.image_alt ?? CULTURE_COPY.imagePlaceholder}
            className="flex h-full items-center justify-center text-sandstone-dark"
          >
            <ImageIcon aria-hidden className="size-12" />
          </div>
        )}
        <span className="absolute top-2 left-2">
          <Badge tone="terracotta">{cultureCategoryLabel(item.category, categories)}</Badge>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p lang="hi" className="text-base text-ink-soft">
          {item.name_hi ?? CULTURE_COPY.hindiUnavailable}
        </p>
        <h2 className="mt-1 break-words font-serif text-2xl leading-tight font-semibold">{item.name}</h2>
        <p className="mt-2">
          <Badge tone="neutral">{item.region}</Badge>
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{item.summary}</p>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-soft">
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-terracotta" />
          <span>
            <span className="font-semibold">{CULTURE_COPY.popularTimeLabel}</span> {item.popular_time ?? CULTURE_COPY.popularTimeUnavailable}
          </span>
        </p>
        <p className="mt-auto pt-3 text-xs text-muted">
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {credit}
            </a>
          ) : (
            credit
          )}
        </p>
      </div>
    </article>
  );
}
