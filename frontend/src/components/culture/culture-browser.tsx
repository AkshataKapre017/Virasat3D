"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { CultureCard } from "@/components/culture/culture-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { cultureListQuery } from "@/lib/api/queries";
import type { CultureCategory, CultureListParams } from "@/lib/api/types";
import {
  CULTURE_CATEGORY_TABS,
  CULTURE_COPY,
  CULTURE_PAGE_SIZE,
  cultureCountLabel,
  cultureRangeLabel,
} from "@/lib/culture";
import { pageNumbers } from "@/lib/sites";

const pagerButton =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-ink/15 bg-[var(--color-card-bg)] px-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/50 hover:bg-sand hover:text-ink focus-visible:ring-2 focus-visible:ring-terracotta/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 aria-[current=page]:border-terracotta aria-[current=page]:bg-terracotta aria-[current=page]:text-white";

export function CultureBrowser() {
  const [category, setCategory] = useState<CultureCategory | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query.trim());

  const params: CultureListParams = {
    category,
    q: deferredQuery || undefined,
    limit: CULTURE_PAGE_SIZE,
    offset: (page - 1) * CULTURE_PAGE_SIZE,
  };
  const { data, error, isPending, isFetching, refetch } = useQuery(cultureListQuery(params));

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CULTURE_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const hasFilters = category !== null || deferredQuery.length > 0;
  const rangeStart = (currentPage - 1) * CULTURE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * CULTURE_PAGE_SIZE, total);

  const selectCategory = (next: CultureCategory | null) => {
    setCategory(next);
    setPage(1);
  };

  const clearFilters = () => {
    setCategory(null);
    setQuery("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div role="group" aria-label={CULTURE_COPY.categoryFilterLabel} className="flex flex-wrap gap-1.5">
        {CULTURE_CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value ?? "all"}
            type="button"
            className="chip"
            aria-pressed={category === tab.value}
            onClick={() => selectCategory(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <label htmlFor="culture-q" className="sr-only">
          {CULTURE_COPY.searchLabel}
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id="culture-q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder={CULTURE_COPY.searchPlaceholder}
          className="field pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <p role="status" aria-live="polite">
          {data && cultureCountLabel(total, hasFilters)}
        </p>
        {hasFilters && (
          <button
            type="button"
            className="font-semibold text-terracotta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-terracotta"
            onClick={clearFilters}
          >
            {CULTURE_COPY.clearFilters}
          </button>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-96" />
            </li>
          ))}
        </ul>
      ) : data.items.length ? (
        <>
          <div className={clsx("transition-opacity", isFetching && "opacity-60")} aria-busy={isFetching}>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <li key={item.id} className="flex">
                  <CultureCard item={item} />
                </li>
              ))}
            </ul>
          </div>

          {pages > 1 && (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <p className="text-sm text-muted">{cultureRangeLabel(rangeStart, rangeEnd, total)}</p>
              <nav aria-label={CULTURE_COPY.paginationLabel}>
                <ul className="flex flex-wrap items-center gap-1">
                  <li>
                    <button
                      type="button"
                      className={pagerButton}
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {CULTURE_COPY.previous}
                    </button>
                  </li>
                  {pageNumbers(currentPage, pages).map((pageNumber, index) =>
                    pageNumber === null ? (
                      <li key={`gap-${index}`} aria-hidden className="px-1 text-sm text-muted">
                        …
                      </li>
                    ) : (
                      <li key={pageNumber}>
                        <button
                          type="button"
                          className={pagerButton}
                          aria-current={pageNumber === currentPage ? "page" : undefined}
                          aria-label={CULTURE_COPY.pageLabel(pageNumber)}
                          onClick={() => setPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      </li>
                    ),
                  )}
                  <li>
                    <button
                      type="button"
                      className={pagerButton}
                      disabled={currentPage === pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {CULTURE_COPY.next}
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}
        </>
      ) : (
        <EmptyState title={CULTURE_COPY.emptyTitle}>{CULTURE_COPY.emptyBody}</EmptyState>
      )}
    </div>
  );
}
