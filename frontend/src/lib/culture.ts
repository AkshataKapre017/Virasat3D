import type { CultureCategoryOption, CultureItem } from "@/lib/api/types";

export const CULTURE_PAGE_SIZE = 12;

export function cultureCategoryLabel(category: string, options: readonly CultureCategoryOption[] = []): string {
  return (
    options.find((option) => option.value === category)?.label ??
    category.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function cultureCreditLine(item: Pick<CultureItem, "credit" | "licence">): string {
  const parts = [item.credit, item.licence].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : CULTURE_COPY.creditUnavailable;
}

export function cultureCountLabel(total: number, filtered: boolean): string {
  const noun = total === 1 ? "entry" : "entries";
  return filtered ? `${total} ${noun} match your filters` : `${total} ${noun}`;
}

export function cultureRangeLabel(start: number, end: number, total: number): string {
  return `Showing ${start}–${end} of ${total} entries`;
}

export const CULTURE_COPY = {
  title: "Culture",
  intro:
    "Crafts, dances, festivals and recorded media from the field archive — the living practices that continue around India's built heritage.",
  allCategories: "All",
  searchLabel: "Search culture",
  searchPlaceholder: "Search names, regions or summaries…",
  categoryFilterLabel: "Filter by category",
  regionFilterLabel: "Filter by region",
  allRegions: "All regions",
  clearFilters: "Clear filters",
  imagePlaceholder: "Image not available",
  hindiUnavailable: "Hindi name not available",
  popularTimeLabel: "Popular time:",
  popularTimeUnavailable: "Not specified",
  creditUnavailable: "Image credit not provided",
  emptyTitle: "Nothing here yet",
  emptyBody: "Try another category, region or search term.",
  previous: "Previous",
  next: "Next",
  paginationLabel: "Culture pagination",
  pageLabel: (page: number) => `Page ${page}`,
} as const;
