import { describe, expect, it } from "vitest";

import { buildSiteTimeline, distanceKm, isFolkloreSite, placesWithin, planDay, relatedSites } from "@/lib/atlas";

const at = (key: string, lat: number, lon: number) => ({ key, name: key, lat, lon });

const base = { category: "stepwell", summary: "A stepwell.", tags: [] as string[] };

describe("isFolkloreSite", () => {
  it("includes sites tagged folklore", () => {
    expect(isFolkloreSite({ ...base, tags: ["stepwell", "Folklore"] })).toBe(true);
  });

  it("includes non-craft sites whose summary names a legend, myth, oral story or tradition", () => {
    expect(isFolkloreSite({ ...base, summary: "Linked by tradition to a legendary king." })).toBe(true);
    expect(isFolkloreSite({ ...base, category: "temple", summary: "A myth tells of its founding." })).toBe(true);
    expect(isFolkloreSite({ ...base, summary: "Known through oral stories of the village." })).toBe(true);
  });

  it("excludes craft traditions and unrelated summaries", () => {
    expect(isFolkloreSite({ category: "craft", summary: "A living craft tradition.", tags: [] })).toBe(false);
    expect(isFolkloreSite({ ...base, summary: "A five-storey stepwell with carved pillars." })).toBe(false);
  });

  it("does not match words that merely contain a pattern", () => {
    expect(isFolkloreSite({ ...base, summary: "Moral instruction is absent here." })).toBe(false);
  });
});

describe("distanceKm", () => {
  it("measures one degree of latitude as about 111 km and zero for the same point", () => {
    expect(distanceKm(at("a", 0, 0), at("b", 1, 0))).toBeCloseTo(111.2, 0);
    expect(distanceKm(at("a", 23, 72), at("a", 23, 72))).toBe(0);
  });
});

describe("placesWithin", () => {
  const origin = at("origin", 23.0, 72.6);
  it("keeps only places inside the radius, nearest first, and drops the origin", () => {
    const near = at("near", 23.2, 72.6); // ~22 km
    const far = at("far", 24.5, 72.6); // ~167 km
    const result = placesWithin(origin, [far, origin, near]);
    expect(result.map((r) => r.place.key)).toEqual(["near"]);
    expect(result[0].km).toBeLessThan(100);
  });
});

describe("planDay", () => {
  it("chains nearest candidates from the start, skipping any beyond the radius", () => {
    const start = at("start", 23.0, 72.6);
    const plan = planDay(start, [at("far", 25.0, 72.6), at("b", 23.3, 72.6), at("a", 23.1, 72.6)], 4);
    expect(plan.stops.map((p) => p.key)).toEqual(["a", "b"]);
    expect(plan.legKm).toHaveLength(2);
    expect(plan.totalKm).toBeCloseTo(plan.legKm[0] + plan.legKm[1], 6);
  });

  it("returns an empty plan when nothing is within reach", () => {
    expect(planDay(at("s", 0, 0), [at("far", 10, 10)])).toEqual({ stops: [], legKm: [], totalKm: 0 });
  });
});

describe("relatedSites", () => {
  const site = (id: number, category: string, tags: string[], lat = 0) =>
    ({ id, slug: `s${id}`, name: `S${id}`, category, tags, lat, lon: 0 }) as never;

  it("ranks same-category sites above tag-only matches and excludes unrelated sites", () => {
    const base = site(1, "stepwell", ["folklore"]);
    const sameCat = site(2, "stepwell", []);
    const tagOnly = site(3, "temple", ["folklore"]);
    const unrelated = site(4, "fort", ["desert"]);
    const result = relatedSites(base, [base, tagOnly, sameCat, unrelated]);
    expect(result.map((r) => r.site.id)).toEqual([2, 3]);
    expect(result[0].reason).toBe("Stepwell");
    expect(result[1].reason).toBe("folklore");
  });
});

describe("buildSiteTimeline", () => {
  const site = {
    era_start: 1063,
    era_end: 1083,
    era_label: "Chaulukya (Solanki), 11th century",
    journeys: [{ slug: "stepwells", title: "Stepwells of the North", year: 2019, color: "#000000" }],
    assets: [
      { id: 7, kind: "photo", title: "Undated sketch", status: "ready", era_year: null },
      { id: 3, kind: "scan", title: "Survey notes", status: "ready", era_year: 1900 },
    ],
  };

  it("orders dated entries by year and places undated items last", () => {
    const entries = buildSiteTimeline(site);
    expect(entries.map((e) => e.id)).toEqual(["era", "archive-3", "journey-stepwells", "archive-7"]);
  });

  it("uses stored era fields and links without inventing dates", () => {
    const [era] = buildSiteTimeline(site);
    expect(era).toMatchObject({ kind: "era", year: 1063, label: "Chaulukya (Solanki), 11th century", href: null });
    expect(era.detail).toBeTruthy();
    const journey = buildSiteTimeline(site).find((e) => e.kind === "journey");
    expect(journey).toMatchObject({ year: 2019, href: "/journeys/stepwells" });
  });

  it("returns an empty timeline when a site has no stored dates or records", () => {
    expect(buildSiteTimeline({ era_start: null, era_end: null, era_label: null, journeys: [], assets: [] })).toEqual([]);
  });
});
