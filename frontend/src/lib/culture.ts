/** Culture section copy and category metadata (kept out of presentation components). */
import type { CultureCategory, CultureItem } from "@/lib/api/types";

export const CULTURE_PAGE_SIZE = 12;

const CATEGORY_LABELS: Record<CultureCategory, string> = {
  craft: "Craft",
  dance: "Dance",
  festival: "Festival",
  media: "Media",
};

export const CULTURE_CATEGORY_TABS: readonly { value: CultureCategory | null; label: string }[] = [
  { value: null, label: "All" },
  ...(Object.entries(CATEGORY_LABELS) as [CultureCategory, string][]).map(([value, label]) => ({ value, label })),
];

export function cultureCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as CultureCategory] ?? category;
}

export function cultureCreditLine(item: Pick<CultureItem, "credit" | "licence">): string | null {
  const parts = [item.credit, item.licence].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
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
  searchLabel: "Search culture",
  searchPlaceholder: "Search names, regions or summaries…",
  categoryFilterLabel: "Filter by category",
  clearFilters: "Clear filters",
  imagePlaceholder: "Image not available",
  emptyTitle: "No culture entries match",
  emptyBody: "Try another category or search term.",
  previous: "Previous",
  next: "Next",
  paginationLabel: "Culture pagination",
  pageLabel: (page: number) => `Page ${page}`,
} as const;
