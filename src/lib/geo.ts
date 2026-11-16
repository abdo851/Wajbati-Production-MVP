export type LatLng = { lat: number; lng: number };

/** Approximate city centers for map display (Casablanca, Rabat, Marrakech). */
const CITY_COORDS: Record<string, LatLng> = {
  casablanca: { lat: 33.5731, lng: -7.5898 },
  rabat: { lat: 34.0209, lng: -6.8416 },
  marrakech: { lat: 31.6295, lng: -7.9811 },
};

export const DEFAULT_CENTER: LatLng = CITY_COORDS.casablanca;

export function cityCenter(city: string | null | undefined): LatLng {
  const key = (city ?? "").trim().toLowerCase();
  return CITY_COORDS[key] ?? DEFAULT_CENTER;
}
