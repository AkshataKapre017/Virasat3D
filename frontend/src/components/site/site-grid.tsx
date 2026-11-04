"use client";

import { useQuery } from "@tanstack/react-query";
import { Box, ChevronDown, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SketchfabEmbed } from "@/components/site/sketchfab-embed";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Thumb } from "@/components/ui/thumb";
import { sitesQuery } from "@/lib/api/queries";
import { categoryColor, formatEra, titleCase } from "@/lib/format";
import {
  REGION_OPTIONS,
  SITES_PAGE_SIZE,
  filterSites,
  matchesRegion,
  pageCount,
  pageNumbers,
  pageSlice,
  regionLabel,
  swapFirstTwoPages,
  type RegionFilter,
} from "@/lib/sites";
import { SKETCHFAB_MODELS } from "@/data/sketchfab-models";

const normalizeSiteKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const siteModelId = (site: { name: string; slug: string; alt_names?: string[] | null }) => {
  const candidateKeys = [site.slug, site.name, ...(site.alt_names ?? [])].map(normalizeSiteKey).filter(Boolean);
  const allNormalized = Object.fromEntries(Object.entries(SKETCHFAB_MODELS).map(([key, id]) => [normalizeSiteKey(key), id]));

  const directMatch = candidateKeys.find((key) => allNormalized[key]);
  if (directMatch) return allNormalized[directMatch];

  for (const key of candidateKeys) {
    const match = Object.keys(allNormalized).find((entryKey) => entryKey.includes(key) || key.includes(entryKey));
    if (match) return allNormalized[match];
  }

  return null;
};

const closeModel = (
  setActiveModelSlug: (value: string | null) => void,
  setLoadingModelSlug: (value: string | null) => void,
) => {
  setActiveModelSlug(null);
  setLoadingModelSlug(null);
};

const pagerButton =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-ink/15 bg-white px-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-terracotta/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 aria-[current=page]:border-terracotta aria-[current=page]:bg-terracotta aria-[current=page]:text-white";

export function SiteGrid({ scope = "heritage" }: { scope?: "heritage" | "craft" }) {
  const { data, error, isPending, refetch } = useQuery(sitesQuery());
  const [region, setRegion] = useState<RegionFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activeModelSlug, setActiveModelSlug] = useState<string | null>(null);
  const [loadingModelSlug, setLoadingModelSlug] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeModelSlug) {
        closeModel(setActiveModelSlug, setLoadingModelSlug);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModelSlug]);

  const sites = useMemo(
    () => (data ?? []).filter((s) => (s.category === "craft") === (scope === "craft")),
    [data, scope],
  );
  const categories = useMemo(() => [...new Set(sites.map((s) => s.category))].sort(), [sites]);
  const regionScoped = sites.filter((s) => matchesRegion(s.state, region));
  const shown = useMemo(
    () => swapFirstTwoPages(filterSites(sites, region, category)),
    [sites, region, category],
  );
  const filtered = region !== "all" || category !== null;
  const totalPages = pageCount(shown.length);
  const currentPage = Math.min(page, totalPages);
  const pageItems = pageSlice(shown, currentPage);
  const rangeStart = (currentPage - 1) * SITES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * SITES_PAGE_SIZE, shown.length);

  const selectRegion = (next: RegionFilter) => {
    setRegion(next);
    setPage(1);
  };

  const selectCategory = (next: string | null) => {
    setCategory(next);
    setPage(1);
  };

  const clearFilters = () => {
    selectRegion("all");
    selectCategory(null);
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <>
      <div className="mb-5 space-y-2">
        <div className="relative max-w-xs">
          <label htmlFor="site-region" className="sr-only">
            Filter by region
          </label>
          <select
            id="site-region"
            value={region}
            onChange={(e) => selectRegion(e.target.value as RegionFilter)}
            className="field h-10 w-full appearance-none rounded-xl bg-white pr-10 font-medium text-ink shadow-sm hover:border-terracotta/50 focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta/20 focus-visible:outline-none"
          >
            {REGION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({sites.filter((s) => matchesRegion(s.state, option.id)).length})
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
        </div>
        <div className="relative max-w-xs">
          <label htmlFor="site-category" className="sr-only">
            Filter by category
          </label>
          <select
            id="site-category"
            value={category ?? ""}
            onChange={(e) => selectCategory(e.target.value || null)}
            className="field h-10 w-full appearance-none rounded-xl bg-white pr-10 font-medium text-ink shadow-sm hover:border-terracotta/50 focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta/20 focus-visible:outline-none"
          >
            <option value="">All categories{data && ` (${regionScoped.length})`}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <p role="status" aria-live="polite">
          <span className="font-semibold text-ink">{shown.length}</span> {shown.length === 1 ? "site" : "sites"}
          {filtered && <> of {sites.length}</>}
          {region !== "all" && <> in {regionLabel(region)}</>}
          {category && <> · {titleCase(category)}</>}
        </p>
        {filtered && (
          <button
            type="button"
            className="font-semibold text-terracotta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-terracotta"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {isPending ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-80" />
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((s, index) => {
              const modelId = siteModelId(s);
              const isModelOpen = activeModelSlug === s.slug;
              const isPageOneFirstCard = currentPage === 1 && index === 0;
              const showModelToggle = Boolean(modelId) && !isPageOneFirstCard;

              return (
                <li key={s.slug} className="flex">
                  <article className="card group relative flex h-full w-full flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
                    <div className="relative">
                      {isModelOpen && modelId ? (
                        <div className="relative block w-full overflow-hidden bg-black">
                          {loadingModelSlug === s.slug && (
                            <div className="absolute inset-0 z-20 grid place-items-center bg-black/45">
                              <span
                                className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
                                aria-label="Loading 3D model"
                              />
                            </div>
                          )}
                          <SketchfabEmbed
                            key={`${s.slug}-iframe`}
                            uid={modelId}
                            title={`${s.name} 3D model`}
                            showFooter={false}
                            onLoad={() => setLoadingModelSlug((current) => (current === s.slug ? null : current))}
                          />
                        </div>
                      ) : s.cover_source_url ? (
                        <a
                          href={s.cover_source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${s.name} photo source (opens original source)`}
                          className="relative z-10 block"
                        >
                          <Thumb src={s.cover_url} alt="" className="aspect-[16/10] w-full" />
                          <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
                            Photo source
                          </span>
                        </a>
                      ) : (
                        <Link href={`/sites/${s.slug}`} aria-label={`Open ${s.name}`} className="relative z-10 block">
                          <Thumb src={s.cover_url} alt="" className="aspect-[16/10] w-full" />
                        </Link>
                      )}

                      {showModelToggle && (
                        <button
                          type="button"
                          aria-label={isModelOpen ? `Close 3D view for ${s.name}` : `Open 3D view for ${s.name}`}
                          aria-pressed={isModelOpen}
                          onClick={() => {
                            if (isModelOpen) {
                              closeModel(setActiveModelSlug, setLoadingModelSlug);
                              return;
                            }

                            setActiveModelSlug((current) => {
                              if (current && current !== s.slug) {
                                return s.slug;
                              }
                              return s.slug;
                            });
                            setLoadingModelSlug(s.slug);
                          }}
                          className="absolute right-2 bottom-2 z-30 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
                        >
                          {isModelOpen ? "Close 3D" : "3D"}
                        </button>
                      )}

                      <div className="absolute top-2 left-2 z-20 flex flex-wrap gap-1.5">
                        {s.unesco && <Badge tone="ochre">UNESCO</Badge>}
                        {(s.twin_count > 0 || Boolean(modelId)) && scope !== "craft" && (
                          <Badge tone="indigo">
                            <Box aria-hidden className="size-3" /> 3D
                          </Badge>
                        )}
                        {s.twin_count === 0 && !modelId && (
                          <Badge title="Site information only — no 3D model yet">
                            <Info aria-hidden className="size-3" /> Information
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: categoryColor(s.category) }} />
                        {titleCase(s.category)} · {s.district ?? s.state}
                      </p>
                      <h2 className="mt-1 font-serif text-2xl leading-tight font-semibold">
                        <Link
                          href={`/sites/${s.slug}`}
                          className="after:absolute after:inset-0 group-hover:underline focus-visible:outline-none"
                        >
                          {s.name}
                        </Link>
                      </h2>
                      <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{s.summary}</p>
                      <p className="mt-auto pt-3 text-xs text-muted">
                        {s.era_label ?? formatEra(s.era_start, s.era_end)} · {s.asset_count} items
                      </p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted">
              Showing <span className="font-semibold text-ink">{rangeStart}–{rangeEnd}</span> of{" "}
              <span className="font-semibold text-ink">{shown.length}</span> heritage sites
            </p>
            {totalPages > 1 && (
              <nav aria-label="Pagination">
                <ul className="flex flex-wrap items-center gap-1">
                  <li>
                    <button
                      type="button"
                      className={pagerButton}
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                  </li>
                  {pageNumbers(currentPage, totalPages).map((p, i) =>
                    p === null ? (
                      <li key={`gap-${i}`} aria-hidden className="px-1 text-sm text-muted">
                        …
                      </li>
                    ) : (
                      <li key={p}>
                        <button
                          type="button"
                          className={pagerButton}
                          aria-current={p === currentPage ? "page" : undefined}
                          aria-label={`Page ${p}`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      </li>
                    ),
                  )}
                  <li>
                    <button
                      type="button"
                      className={pagerButton}
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </nav>
            )}
          </div>
        </>
      ) : (
        <EmptyState title="No sites match these filters" icon={<Info className="size-6 text-sandstone-dark" aria-hidden />}>
          Try another region or category, or{" "}
          <button type="button" className="font-semibold text-terracotta underline" onClick={clearFilters}>
            clear the filters
          </button>
          .
        </EmptyState>
      )}
    </>
  );
}
