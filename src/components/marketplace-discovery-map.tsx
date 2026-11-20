"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { findLaunchCity, LAUNCH_CITIES } from "@/lib/marketplace/launch-geography";
import type { PublicMarketplaceListing } from "@/lib/marketplace/types";

type Props = {
  items: PublicMarketplaceListing[];
  cityFilter: string;
  onSelect: (listing: PublicMarketplaceListing) => void;
  emptyLabel: string;
  approxLabel: string;
};

/** City-level approximate markers only — never private street addresses. */
export function MarketplaceDiscoveryMap({ items, cityFilter, onSelect, emptyLabel, approxLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const focus = findLaunchCity(cityFilter !== "all" ? cityFilter : null);
    const center: [number, number] = focus
      ? [focus.center.lat, focus.center.lng]
      : [LAUNCH_CITIES[1].center.lat, LAUNCH_CITIES[1].center.lng];
    const map = L.map(containerRef.current, { center, zoom: focus ? 12 : 11, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const byCity = new Map<string, PublicMarketplaceListing[]>();
    for (const item of items) {
      const key = item.city.trim() || "—";
      const list = byCity.get(key) ?? [];
      list.push(item);
      byCity.set(key, list);
    }

    for (const [cityName, listings] of byCity) {
      const city = findLaunchCity(cityName);
      if (!city) continue;
      const marker = L.circleMarker([city.center.lat, city.center.lng], {
        radius: Math.min(14, 8 + listings.length),
        color: "#6F1420",
        fillColor: "#9B1D2E",
        fillOpacity: 0.75,
        weight: 2,
      }).addTo(map);
      marker.bindPopup(
        `<strong>${city.name}</strong><br/>${listings.length} · ${listings[0]?.title ?? ""}`,
      );
      marker.on("click", () => onSelect(listings[0]!));
    }

    const timer = window.setTimeout(() => map.invalidateSize(), 220);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [cityFilter, items, onSelect]);

  return (
    <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-line bg-card shadow-lux">
      <p className="border-b border-line/70 px-4 py-2 text-xs font-semibold text-muted">{approxLabel}</p>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div ref={containerRef} className="h-[min(52vh,26rem)] w-full" />
      )}
    </div>
  );
}
