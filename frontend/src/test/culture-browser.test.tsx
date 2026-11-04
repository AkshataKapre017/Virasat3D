import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  location: { search: "?category=dance" },
  replace: vi.fn(),
  listQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/culture",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.location.search),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    mocks.listQuery(options);
    return {
      data: {
        items: [
          {
            id: 1,
            category: "dance",
            name: "Garba",
            name_hi: null,
            region: "Gujarat",
            summary: "A circular devotional dance performed during Navratri.",
            popular_time: null,
            highlights: [],
            image_url: null,
            image_alt: null,
            credit: null,
            licence: null,
            source_url: null,
          },
        ],
        total: 1,
        limit: 12,
        offset: 0,
        all_count: 4,
        categories: [
          { value: "craft", label: "Craft", count: 1 },
          { value: "dance", label: "Dance", count: 1 },
          { value: "festival", label: "Festival", count: 1 },
          { value: "oral_history", label: "Oral History", count: 0 },
        ],
        regions: [{ value: "Gujarat", label: "Gujarat", count: 1 }],
      },
      error: null,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));

import { CultureBrowser } from "@/components/culture/culture-browser";

beforeEach(() => {
  mocks.location.search = "?category=dance";
  mocks.replace.mockClear();
  mocks.listQuery.mockClear();
});

afterEach(cleanup);

describe("CultureBrowser", () => {
  it("loads the selected category from the URL and renders API categories and counts", () => {
    render(<CultureBrowser />);

    expect(mocks.listQuery.mock.calls[0]?.[0]).toMatchObject({
      queryKey: expect.arrayContaining([expect.objectContaining({ category: "dance" })]),
    });
    expect(screen.getByRole("button", { name: "Dance 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Oral History 0" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Garba" })).toBeTruthy();
  });

  it("writes the selected category to the shareable URL", () => {
    render(<CultureBrowser />);
    fireEvent.click(screen.getByRole("button", { name: "Festival 1" }));

    expect(mocks.replace).toHaveBeenCalledWith("/culture?category=festival", { scroll: false });
  });

  it("shows missing content placeholders on cards", () => {
    render(<CultureBrowser />);

    expect(screen.getByRole("img", { name: "Image not available" })).toBeTruthy();
    expect(screen.getByText("Hindi name not available")).toBeTruthy();
    expect(screen.getByText("Popular time:")).toBeTruthy();
    expect(screen.getByText("Not specified")).toBeTruthy();
    expect(screen.getByText("Image credit not provided")).toBeTruthy();
  });
});
