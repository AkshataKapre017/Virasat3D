/** Shared navigation config so the header, footer and search links stay in one place. */

export const SEARCH_HREF = "/search";

export const NAV = [
  { href: "/", label: "Explore", header: true, footerGroup: "Explore", footerLabel: "Atlas", footerOrder: 0 },
  { href: "/sites", label: "Sites", header: true, footerGroup: "Explore", footerLabel: "Sites", footerOrder: 1 },
  { href: "/journeys", label: "Journeys", header: false, footerGroup: "Explore", footerLabel: "Journeys", footerOrder: 2 },
  { href: "/culture", label: "Culture", header: true, footerGroup: "Explore", footerLabel: "Culture", footerOrder: 3 },
  { href: SEARCH_HREF, label: "Search", header: false, footerGroup: "Explore", footerLabel: "Search", footerOrder: 4 },
  { href: "/rent-a-car", label: "Rent a Car", header: true, footerGroup: null, footerLabel: null, footerOrder: 0 },
  { href: "/heritage-hotels", label: "Heritage Stay", header: true, footerGroup: null, footerLabel: null, footerOrder: 0 },
  { href: "/archive", label: "Archive", header: true, footerGroup: "Archive", footerLabel: "Archive", footerOrder: 1 },
  {
    href: "/contribute",
    label: "Contribute",
    header: true,
    footerGroup: "Archive",
    footerLabel: "Contribute",
    footerOrder: 0,
    permission: "contribute",
  },
] as const;

export const FOOTER_LINK_GROUPS = ["Explore", "Archive"].map((label) => ({
  label,
  links: NAV.filter((item) => item.footerGroup === label).sort((a, b) => a.footerOrder - b.footerOrder),
}));

export const FOOTER_COPY = {
  brand: "Virasat3D",
  description: "Discover India's heritage through archives, places, and stories.",
  copyright: (year: number) => `© ${year} Virasat3D`,
  imageCredits: "Image credits and licences are shown with each item; basemap © OpenStreetMap contributors.",
} as const;
