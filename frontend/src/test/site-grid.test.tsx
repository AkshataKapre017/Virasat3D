import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@tanstack/react-query", () => {
  const sites = [
    {
      id: 1,
      slug: "konark",
      name: "Konark Sun Temple",
      name_native: null,
      category: "temple",
      state: "Odisha",
      district: "Puri",
      lat: 19.8876,
      lon: 86.0945,
      era_start: 1238,
      era_end: 1250,
      era_label: "Eastern Ganga, 13th century",
      summary: "A chariot-form Sun temple.",
      tags: [],
      unesco: true,
      cover_url: null,
      asset_count: 0,
      twin_count: 0,
    },
    {
      id: 2,
      slug: "nalanda",
      name: "Nalanda Mahavihara",
      name_native: null,
      category: "archaeological",
      state: "Bihar",
      district: "Nalanda",
      lat: 25.136,
      lon: 85.444,
      era_start: 400,
      era_end: 1200,
      era_label: "Gupta–Pala",
      summary: "Ruins of a Buddhist monastic university.",
      tags: [],
      unesco: true,
      cover_url: null,
      asset_count: 0,
      twin_count: 0,
    },
    {
      id: 3,
      slug: "brihadeeswarar",
      name: "Brihadeeswarar Temple",
      name_native: null,
      category: "temple",
      state: "Tamil Nadu",
      district: "Thanjavur",
      lat: 10.7828,
      lon: 79.1318,
      era_start: 1003,
      era_end: 1010,
      era_label: "Chola",
      summary: "A Chola granite temple.",
      tags: [],
      unesco: true,
      cover_url: null,
      asset_count: 0,
      twin_count: 0,
    },
    {
      id: 4,
      slug: "khajuraho",
      name: "Khajuraho Group of Monuments",
      name_native: null,
      category: "temple",
      state: "Madhya Pradesh",
      district: "Chhatarpur",
      lat: 24.8318,
      lon: 79.9199,
      era_start: 950,
      era_end: 1050,
      era_label: "Chandela",
      summary: "Hindu and Jain temples.",
      tags: [],
      unesco: true,
      cover_url: null,
      asset_count: 0,
      twin_count: 0,
    },
    {
      id: 5,
      slug: "adalaj",
      name: "Adalaj Stepwell",
      name_native: null,
      category: "stepwell",
      state: "Gujarat",
      district: "Gandhinagar",
      lat: 23.1667,
      lon: 72.5806,
      era_start: 1498,
      era_end: 1499,
      era_label: "Gujarat Sultanate",
      summary: "A five-storey stepwell.",
      tags: [],
      unesco: false,
      cover_url: null,
      asset_count: 0,
      twin_count: 1,
    },
    {
      id: 6,
      slug: "golconda-fort",
      name: "Golconda Fort",
      name_native: null,
      category: "fort",
      state: "Telangana",
      district: "Hyderabad",
      lat: 17.3833,
      lon: 78.4011,
      era_start: 1200,
      era_end: 1600,
      era_label: "Qutb Shahi",
      summary: "A hilltop Deccan citadel.",
      tags: [],
      unesco: false,
      cover_url: null,
      asset_count: 0,
      twin_count: 0,
    },
  ];
  return {
    queryOptions: <T,>(options: T) => options,
    useQuery: () => ({ data: sites, error: null, isPending: false, refetch: vi.fn() }),
    useQueryClient: () => ({ removeQueries: vi.fn(), invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  };
});

import { SiteGrid } from "@/components/site/site-grid";

const selectRegion = (id: string) => {
  act(() => {
    fireEvent.change(screen.getByLabelText("Filter by region"), { target: { value: id } });
  });
};

const selectCategory = (value: string) => {
  act(() => {
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value } });
  });
};

const click = (name: RegExp | string) => {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
};

const cardFor = (name: RegExp) => screen.getByRole("link", { name }).closest("article") as HTMLElement;
const names = () => [...document.querySelectorAll("h2")].map((h) => h.textContent);

describe("<SiteGrid>", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(cleanup);

  it("combines region and category filters and updates the count", () => {
    render(<SiteGrid />);
    expect(screen.getByRole("status").textContent).toBe("6 sites");
    expect(names()).toHaveLength(6);

    selectRegion("east");
    expect(screen.getByRole("status").textContent).toBe("2 sites of 6 in East India");
    expect(names()).toEqual(["Konark Sun Temple", "Nalanda Mahavihara"]);

    selectCategory("temple");
    expect(screen.getByRole("status").textContent).toBe("1 site of 6 in East India · Temple");
    expect(names()).toEqual(["Konark Sun Temple"]);

    selectRegion("all");
    expect(screen.getByRole("status").textContent).toBe("3 sites of 6 · Temple");
    expect(names()).toEqual(["Konark Sun Temple", "Brihadeeswarar Temple", "Khajuraho Group of Monuments"]);
  });

  it("shows an empty state for a region/category combination with no records", () => {
    render(<SiteGrid />);
    selectRegion("east");
    selectCategory("fort");

    expect(screen.getByRole("status").textContent).toBe("0 sites of 6 in East India · Fort");
    expect(screen.getByText("No sites match these filters")).toBeTruthy();
    expect(names()).toHaveLength(0);
  });

  it("clears both filters and restores every site", () => {
    render(<SiteGrid />);
    selectRegion("south");
    selectCategory("temple");
    expect(screen.getByRole("status").textContent).toBe("1 site of 6 in South India · Temple");

    click("Clear filters");
    expect(screen.getByRole("status").textContent).toBe("6 sites");
    expect(names()).toHaveLength(6);
  });

  it("distinguishes 3D records from information-only records", () => {
    render(<SiteGrid />);
    const adalaj = cardFor(/Adalaj Stepwell/);
    const konark = cardFor(/Konark Sun Temple/);
    const nalanda = cardFor(/Nalanda Mahavihara/);

    const badgesOf = (card: HTMLElement) => card.querySelector(".absolute.top-2.left-2")?.textContent ?? "";

    expect(badgesOf(adalaj)).toContain("3D");
    expect(badgesOf(adalaj)).not.toContain("360° tour");
    expect(badgesOf(adalaj)).not.toContain("Information");
    expect(badgesOf(konark)).toContain("3D");
    expect(badgesOf(konark)).not.toContain("360° tour");
    expect(badgesOf(konark)).not.toContain("Information");
    expect(badgesOf(nalanda)).toContain("Information");
    expect(badgesOf(nalanda)).not.toContain("3D");
  });
});
