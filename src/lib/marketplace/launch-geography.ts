/**
 * Launch geography for Marketplace discovery.
 * Curated public districts for Temara / Rabat / Salé — not a complete street directory.
 * Street-level coverage is intentionally limited; customers can refine via text search.
 */

export type LaunchCityId = "temara" | "rabat" | "sale";

export type LaunchNeighborhood = {
  id: string;
  /** Stable English key used in filters and storage. */
  name: string;
};

export type LaunchCity = {
  id: LaunchCityId;
  /** Canonical filter value stored on listings / search. */
  name: string;
  /** Approximate public city center for map discovery (not a private address). */
  center: { lat: number; lng: number };
  neighborhoods: LaunchNeighborhood[];
};

export const LAUNCH_CITIES: LaunchCity[] = [
  {
    id: "temara",
    name: "Temara",
    center: { lat: 33.9203, lng: -6.9108 },
    neighborhoods: [
      { id: "temara-centre", name: "Centre" },
      { id: "temara-harhoura", name: "Harhoura" },
      { id: "temara-massira", name: "Massira" },
      { id: "temara-wiaam", name: "Wiaam" },
      { id: "temara-skhirat-road", name: "Route de Skhirat" },
    ],
  },
  {
    id: "rabat",
    name: "Rabat",
    center: { lat: 34.0209, lng: -6.8416 },
    neighborhoods: [
      { id: "rabat-agdal", name: "Agdal" },
      { id: "rabat-hassan", name: "Hassan" },
      { id: "rabat-les-orangers", name: "Les Orangers" },
      { id: "rabat-hay-riad", name: "Hay Riad" },
      { id: "rabat-yakoub-el-mansour", name: "Yacoub El Mansour" },
      { id: "rabat-souissi", name: "Souissi" },
    ],
  },
  {
    id: "sale",
    name: "Salé",
    center: { lat: 34.0531, lng: -6.7985 },
    neighborhoods: [
      { id: "sale-tabriquet", name: "Tabriquet" },
      { id: "sale-bettana", name: "Bettana" },
      { id: "sale-layayda", name: "Layayda" },
      { id: "sale-sidi-moussa", name: "Sidi Moussa" },
      { id: "sale-bab-lamrissa", name: "Bab Lamrissa" },
    ],
  },
];

export function findLaunchCity(name: string | null | undefined): LaunchCity | null {
  const needle = (name || "").trim().toLowerCase();
  if (!needle) return null;
  return (
    LAUNCH_CITIES.find(
      (city) =>
        city.name.toLowerCase() === needle ||
        city.id === needle ||
        (city.id === "sale" && (needle === "sale" || needle === "salé")),
    ) ?? null
  );
}

export function neighborhoodsForCity(cityName: string | null | undefined): LaunchNeighborhood[] {
  return findLaunchCity(cityName)?.neighborhoods ?? [];
}

/** Match listing city loosely against launch + free-text cities. */
export function cityMatchesFilter(listingCity: string, filterCity: string): boolean {
  if (!filterCity || filterCity === "all") return true;
  const left = listingCity.trim().toLowerCase();
  const right = filterCity.trim().toLowerCase();
  if (!left) return false;
  if (left === right) return true;
  if (right === "salé" || right === "sale") return left === "sale" || left === "salé";
  return left.includes(right) || right.includes(left);
}

export function neighborhoodMatchesListing(
  listing: { city: string; neighborhood?: string; description?: string; title?: string; category?: string },
  neighborhood: string,
): boolean {
  if (!neighborhood || neighborhood === "all") return true;
  const needle = neighborhood.trim().toLowerCase();
  const stored = (listing.neighborhood || "").trim().toLowerCase();
  if (stored) return stored === needle || stored.includes(needle);
  // Legacy fallback only when neighborhood column is empty — not street coverage.
  const hay = `${listing.city} ${listing.title || ""} ${listing.description || ""} ${listing.category || ""}`.toLowerCase();
  return hay.includes(needle);
}
