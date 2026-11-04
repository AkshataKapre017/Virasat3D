export const HERITAGE_CATEGORIES = ["Heritage Grand", "Heritage Classic", "Heritage"] as const;

export interface Hotel {
  name: string;
  city: string;
  state: string;
  category: string | null;
  builtYear: number | null;
  about: string | null;
  rooms: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  image: string;
  imageCredit?: string;
  imageSourceUrl?: string;
  detailUrl: string | null;
}

export interface HeritageHotelsData {
  banner: { image: string; alt: string };
  hotels: Hotel[];
}

export interface HotelFilters {
  state: string;
  category: string;
  query: string;
}

export interface StateGroup {
  state: string;
  hotels: Hotel[];
}

export function stateOptions(hotels: Hotel[]): string[] {
  return [...new Set(hotels.map((h) => h.state))].sort((a, b) => a.localeCompare(b));
}

export function filterHotels(hotels: Hotel[], filters: HotelFilters): Hotel[] {
  const query = filters.query.trim().toLowerCase();
  return hotels.filter(
    (h) =>
      (!filters.state || h.state === filters.state) &&
      (!filters.category || h.category === filters.category) &&
      (!query || h.name.toLowerCase().includes(query) || h.city.toLowerCase().includes(query)),
  );
}

export function groupByState(hotels: Hotel[]): StateGroup[] {
  const byState = new Map<string, Hotel[]>();
  for (const hotel of hotels) {
    const list = byState.get(hotel.state);
    if (list) list.push(hotel);
    else byState.set(hotel.state, [hotel]);
  }
  return [...byState.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === "Rajasthan" ? -1 : b === "Rajasthan" ? 1 : a.localeCompare(b)))
    .map(([state, list]) => ({
      state,
      hotels: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
