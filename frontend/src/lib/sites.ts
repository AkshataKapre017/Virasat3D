/** Region grouping, capability flags and filter helpers for the /sites gazetteer. */

export type RegionId = "north" | "south" | "east" | "west" | "central";
export type RegionFilter = "all" | RegionId;

export const REGION_OPTIONS: ReadonlyArray<{ id: RegionFilter; label: string }> = [
  { id: "all", label: "All India" },
  { id: "north", label: "North India" },
  { id: "south", label: "South India" },
  { id: "east", label: "East India" },
  { id: "west", label: "West India" },
  { id: "central", label: "Central India" },
];

/** Northeast India is deliberately grouped with the East, matching the filter brief. */
const STATE_REGION: Record<string, RegionId> = {
  // North
  "jammu and kashmir": "north",
  ladakh: "north",
  "himachal pradesh": "north",
  punjab: "north",
  haryana: "north",
  chandigarh: "north",
  uttarakhand: "north",
  "uttar pradesh": "north",
  delhi: "north",
  rajasthan: "north",
  // South
  "andhra pradesh": "south",
  karnataka: "south",
  kerala: "south",
  "tamil nadu": "south",
  telangana: "south",
  puducherry: "south",
  lakshadweep: "south",
  // East (including the Northeast)
  bihar: "east",
  jharkhand: "east",
  odisha: "east",
  "west bengal": "east",
  "andaman and nicobar islands": "east",
  assam: "east",
  "arunachal pradesh": "east",
  manipur: "east",
  meghalaya: "east",
  mizoram: "east",
  nagaland: "east",
  sikkim: "east",
  tripura: "east",
  // West
  gujarat: "west",
  maharashtra: "west",
  goa: "west",
  "dadra and nagar haveli and daman and diu": "west",
  // Central
  "madhya pradesh": "central",
  chhattisgarh: "central",
};

const STATE_ALIASES: Record<string, string> = {
  "jammu kashmir": "jammu and kashmir",
  "nct of delhi": "delhi",
  orissa: "odisha",
  pondicherry: "puducherry",
  "andaman and nicobar": "andaman and nicobar islands",
  "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
  "daman and diu": "dadra and nagar haveli and daman and diu",
};

function normalizeState(state: string): string {
  return state
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Resolve a site's state/UT to one of the five regions, or null for an unknown value. */
export function regionForState(state: string | null | undefined): RegionId | null {
  if (!state) return null;
  const key = normalizeState(state);
  return STATE_REGION[STATE_ALIASES[key] ?? key] ?? null;
}

export function matchesRegion(state: string | null | undefined, region: RegionFilter): boolean {
  return region === "all" || regionForState(state) === region;
}

export function regionLabel(region: RegionFilter): string {
  return REGION_OPTIONS.find((option) => option.id === region)?.label ?? "All India";
}

/** Slugs are what the API accepts, so validate before building a route from map data. */
const SITE_SLUG = /^[a-z0-9][a-z0-9-]{1,118}$/;

export function isSiteSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SITE_SLUG.test(value);
}

/**
 * The canonical site route. Map markers only know the feature properties they were given, so a
 * missing or malformed slug must degrade to the gazetteer rather than a broken `/sites/undefined`.
 */
export function siteHref(slug: string | null | undefined): string {
  return isSiteSlug(slug) ? `/sites/${slug}` : "/sites";
}

interface FilterableSite {
  slug: string;
  category: string;
  state: string | null;
}

export const SITES_PAGE_SIZE = 9;

export function pageCount(total: number, pageSize = SITES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize = SITES_PAGE_SIZE): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * Move the second page of results ahead of the first. The gazetteer uses this so the newly
 * documented sites (which currently sort onto page 2) appear on page 1, while pagination keeps
 * showing contiguous result ranges.
 */
export function swapFirstTwoPages<T>(items: readonly T[], pageSize = SITES_PAGE_SIZE): T[] {
  const first = items.slice(0, pageSize);
  const second = items.slice(pageSize, pageSize * 2);
  if (!second.length) return [...items];
  return [...second, ...first, ...items.slice(pageSize * 2)];
}

/** Visible page numbers around the current page, with `null` marking a gap ("…"). */
export function pageNumbers(current: number, total: number): Array<number | null> {
  const pages = [...new Set([1, 2, current - 1, current, current + 1, total - 1, total])]
    .filter((p) => p >= 1 && p <= total && (p <= 2 || p >= total - 1 || Math.abs(p - current) <= 1))
    .sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? [null, p] : [p]));
}

/** Apply the region and category filters together. `null` category means all categories. */
export function filterSites<T extends FilterableSite>(
  sites: readonly T[],
  region: RegionFilter,
  category: string | null,
): T[] {
  return sites.filter((site) => matchesRegion(site.state, region) && (!category || site.category === category));
}
