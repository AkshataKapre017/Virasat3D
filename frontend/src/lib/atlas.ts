import type { SiteDetail, SiteOut } from "@/lib/api/types";
import { formatEra, kindLabel, titleCase } from "@/lib/format";

export const FOLKLORE_COLOR = "#6d28d9";

export const NEARBY_RADIUS_KM = 100;
const EARTH_KM = 6371.0088;

export interface Place {
  key: string;
  name: string;
  slug?: string;
  lat: number;
  lon: number;
}

/** Great-circle (straight-line) distance in kilometres. */
export function distanceKm(a: Pick<Place, "lat" | "lon">, b: Pick<Place, "lat" | "lon">): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sitePlace(site: Pick<SiteOut, "id" | "slug" | "name" | "lat" | "lon">): Place {
  return { key: `site-${site.id}`, name: site.name, slug: site.slug, lat: site.lat, lon: site.lon };
}

export interface NearbyPlace {
  place: Place;
  km: number;
}

/** Places within `radiusKm` of a point, nearest first. */
export function placesWithin(origin: Place, places: Place[], radiusKm = NEARBY_RADIUS_KM): NearbyPlace[] {
  return places
    .filter((p) => p.key !== origin.key)
    .map((place) => ({ place, km: distanceKm(origin, place) }))
    .filter((n) => n.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

/** Places within `radiusKm` of any stop on a route, each with its distance to the nearest stop. */
export function placesNearRoute(stops: Place[], places: Place[], radiusKm = NEARBY_RADIUS_KM): NearbyPlace[] {
  const stopKeys = new Set(stops.map((s) => s.key));
  return places
    .filter((p) => !stopKeys.has(p.key))
    .map((place) => ({ place, km: Math.min(...stops.map((s) => distanceKm(s, place))) }))
    .filter((n) => n.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

export interface DayPlan {
  stops: Place[];
  legKm: number[];
  totalKm: number;
}

/** Greedy nearest-neighbour day from `start`, using only candidates within the radius of `start`. */
export function planDay(start: Place, candidates: Place[], maxStops = 4, radiusKm = NEARBY_RADIUS_KM): DayPlan {
  const remaining = candidates.filter((c) => c.key !== start.key && distanceKm(start, c) <= radiusKm);
  const stops: Place[] = [];
  const legKm: number[] = [];
  let current = start;
  while (stops.length < maxStops && remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceKm(current, remaining[i]) < distanceKm(current, remaining[best])) best = i;
    }
    const [next] = remaining.splice(best, 1);
    legKm.push(distanceKm(current, next));
    stops.push(next);
    current = next;
  }
  return { stops, legKm, totalKm: legKm.reduce((sum, km) => sum + km, 0) };
}

export interface RelatedSite {
  site: SiteOut;
  km: number;
  reason: string;
}

/** Sites sharing a category or tags with `site`, strongest match first; nearest breaks ties. */
export function relatedSites(site: SiteOut, sites: SiteOut[], limit = 4): RelatedSite[] {
  const tags = new Set(site.tags.map((t) => t.toLocaleLowerCase()));
  return sites
    .filter((s) => s.id !== site.id)
    .map((s) => {
      const shared = s.tags.filter((t) => tags.has(t.toLocaleLowerCase()));
      const sameCategory = s.category === site.category;
      const score = (sameCategory ? 2 : 0) + shared.length;
      const reason = sameCategory ? titleCase(site.category) : shared.slice(0, 2).join(", ");
      return { site: s, km: distanceKm(site, s), score, reason };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.km - b.km)
    .slice(0, limit)
    .map(({ site, km, reason }) => ({ site, km, reason }));
}

const NARRATIVE_PATTERN = /\b(legends?|myths?|mythic|oral|folk\w*|tradition\w*)\b/i;

/** Folklore layer: tagged `folklore`, or a non-craft site whose summary names a legend, myth, oral story or tradition. */
export function isFolkloreSite(site: Pick<SiteOut, "category" | "summary" | "tags">): boolean {
  if (site.tags.some((t) => t.trim().toLowerCase() === "folklore")) return true;
  return site.category !== "craft" && NARRATIVE_PATTERN.test(site.summary);
}

export interface TimelineEntry {
  id: string;
  kind: "era" | "journey" | "archive";
  year: number | null;
  label: string;
  detail: string | null;
  href: string | null;
}

type TimelineSite = Pick<SiteDetail, "era_start" | "era_end" | "era_label" | "journeys" | "assets">;

/** Dated entries first in year order, then undated archive items; every entry comes from stored fields. */
export function buildSiteTimeline(site: TimelineSite): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (site.era_start != null || site.era_label) {
    entries.push({
      id: "era",
      kind: "era",
      year: site.era_start,
      label: site.era_label ?? formatEra(site.era_start, site.era_end),
      detail: site.era_start != null ? formatEra(site.era_start, site.era_end) : null,
      href: null,
    });
  }

  for (const j of site.journeys) {
    entries.push({
      id: `journey-${j.slug}`,
      kind: "journey",
      year: j.year,
      label: `Field journey: ${j.title}`,
      detail: null,
      href: `/journeys/${j.slug}`,
    });
  }

  for (const a of site.assets) {
    entries.push({
      id: `archive-${a.id}`,
      kind: "archive",
      year: a.era_year ?? null,
      label: a.title,
      detail: kindLabel(a.kind),
      href: `/assets/${a.id}`,
    });
  }

  const rank = { era: 0, journey: 1, archive: 2 } as const;
  return entries.sort((a, b) => {
    if (a.year == null || b.year == null) {
      if (a.year != null) return -1;
      if (b.year != null) return 1;
    } else if (a.year !== b.year) {
      return a.year - b.year;
    }
    return rank[a.kind] - rank[b.kind];
  });
}
