/** Shared navigation config so the header, footer and search links stay in one place. */

export const SEARCH_HREF = "/search";

export const NAV = [
  { href: "/", label: "Explore" },
  { href: "/sites", label: "Sites" },
  { href: "/culture", label: "Culture" },
  { href: "/rent-a-car", label: "Rent a Car" },
  { href: "/heritage-hotels", label: "Heritage Stay" },
  { href: "/archive", label: "Archive" },
  { href: "/contribute", label: "Contribute", permission: "contribute" },
] as const;
