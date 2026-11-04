import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Footer } from "@/components/footer";

afterEach(cleanup);

describe("Footer", () => {
  it("renders the configured Explore and Archive links with accessible focus styling", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "Atlas" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Sites" }).getAttribute("href")).toBe("/sites");
    expect(screen.getByRole("link", { name: "Journeys" }).getAttribute("href")).toBe("/journeys");
    expect(screen.getByRole("link", { name: "Culture" }).getAttribute("href")).toBe("/culture");
    expect(screen.getByRole("link", { name: "Search" }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: "Contribute" }).getAttribute("href")).toBe("/contribute");
    expect(screen.getByRole("link", { name: "Archive" }).getAttribute("href")).toBe("/archive");
    expect(screen.getByRole("link", { name: "Atlas" }).className).toContain("focus-visible:outline");
    expect(screen.queryByText(/github|repository|source code/i)).toBeNull();
  });
});
