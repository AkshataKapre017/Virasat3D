import { describe, expect, it } from "vitest";

import {
  REGION_OPTIONS,
  filterSites,
  isSiteSlug,
  matchesRegion,
  regionForState,
  regionLabel,
  siteHref,
  swapFirstTwoPages,
  type RegionId,
} from "@/lib/sites";

const STATES_BY_REGION: Record<RegionId, string[]> = {
  north: [
    "Jammu and Kashmir",
    "Ladakh",
    "Himachal Pradesh",
    "Punjab",
    "Haryana",
    "Uttarakhand",
    "Uttar Pradesh",
    "Delhi",
    "Rajasthan",
  ],
  south: ["Andhra Pradesh", "Karnataka", "Kerala", "Tamil Nadu", "Telangana", "Puducherry", "Lakshadweep"],
  east: [
    "Bihar",
    "Jharkhand",
    "Odisha",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Assam",
    "Arunachal Pradesh",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Sikkim",
    "Tripura",
  ],
  west: ["Gujarat", "Maharashtra", "Goa", "Dadra and Nagar Haveli and Daman and Diu"],
  central: ["Madhya Pradesh", "Chhattisgarh"],
};

const SITES = [
  { slug: "konark", state: "Odisha", category: "temple" },
  { slug: "nalanda", state: "Bihar", category: "archaeological" },
  { slug: "brihadeeswarar", state: "Tamil Nadu", category: "temple" },
  { slug: "khajuraho", state: "Madhya Pradesh", category: "temple" },
  { slug: "adalaj", state: "Gujarat", category: "stepwell" },
];

describe("region mapping", () => {
  it.each(Object.entries(STATES_BY_REGION).flatMap(([region, states]) => states.map((state) => [state, region])))(
    "maps %s to %s",
    (state, region) => {
      expect(regionForState(state)).toBe(region);
    },
  );

  it("accepts common state/UT aliases and punctuation", () => {
    expect(regionForState("Jammu & Kashmir")).toBe("north");
    expect(regionForState("NCT of Delhi")).toBe("north");
    expect(regionForState("Orissa")).toBe("east");
    expect(regionForState("Pondicherry")).toBe("south");
    expect(regionForState("Daman and Diu")).toBe("west");
    expect(regionForState("Andaman and Nicobar")).toBe("east");
  });

  it("returns null for unknown or missing states", () => {
    expect(regionForState("Atlantis")).toBeNull();
    expect(regionForState("")).toBeNull();
    expect(regionForState(null)).toBeNull();
    expect(regionForState(undefined)).toBeNull();
  });

  it("matches All India regardless of state metadata", () => {
    expect(matchesRegion("Odisha", "all")).toBe(true);
    expect(matchesRegion(null, "all")).toBe(true);
    expect(matchesRegion("Odisha", "east")).toBe(true);
    expect(matchesRegion("Odisha", "north")).toBe(false);
  });

  it("exposes the requested region labels", () => {
    expect(REGION_OPTIONS.map((option) => option.label)).toEqual([
      "All India",
      "North India",
      "South India",
      "East India",
      "West India",
      "Central India",
    ]);
    expect(regionLabel("east")).toBe("East India");
    expect(regionLabel("all")).toBe("All India");
  });
});

describe("filterSites", () => {
  it("filters by region across every category", () => {
    expect(filterSites(SITES, "east", null).map((s) => s.slug)).toEqual(["konark", "nalanda"]);
    expect(filterSites(SITES, "south", null).map((s) => s.slug)).toEqual(["brihadeeswarar"]);
  });

  it("combines region and category", () => {
    expect(filterSites(SITES, "east", "temple").map((s) => s.slug)).toEqual(["konark"]);
    expect(filterSites(SITES, "all", "temple").map((s) => s.slug)).toEqual([
      "konark",
      "brihadeeswarar",
      "khajuraho",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterSites(SITES, "central", "fort")).toEqual([]);
    expect(filterSites(SITES, "south", "stepwell")).toEqual([]);
  });
});

describe("swapFirstTwoPages", () => {
  it("moves the second page ahead of the first and leaves later pages in order", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(swapFirstTwoPages(items, 5)).toEqual([
      5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("leaves a single page untouched", () => {
    expect(swapFirstTwoPages([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
});

describe("site routes", () => {
  it("builds the canonical /sites/<slug> route from map or list data", () => {
    expect(siteHref("rani-ki-vav")).toBe("/sites/rani-ki-vav");
    expect(siteHref("adalaj")).toBe("/sites/adalaj");
  });

  it("falls back to the gazetteer instead of emitting a broken route", () => {
    expect(siteHref(null)).toBe("/sites");
    expect(siteHref(undefined)).toBe("/sites");
    expect(siteHref("")).toBe("/sites");
    expect(siteHref("Rani Ki Vav")).toBe("/sites");
    expect(siteHref("../admin")).toBe("/sites");
    expect(siteHref("a")).toBe("/sites");
  });

  it("validates slugs with the same shape the API accepts", () => {
    expect(isSiteSlug("rani-ki-vav")).toBe(true);
    expect(isSiteSlug("site-2")).toBe(true);
    expect(isSiteSlug("Site")).toBe(false);
    expect(isSiteSlug("-leading")).toBe(false);
    expect(isSiteSlug("trailing-")).toBe(true);
  });
});
