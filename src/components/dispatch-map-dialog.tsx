"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "@/components/language";
import type { LatLng } from "@/lib/geo";

export type MapMarker = LatLng & { label?: string; color?: string };

function pinHtml(color: string) {
  return `<span style="display:block;width:32px;height:32px;filter:drop-shadow(0 5px 8px rgba(23,19,15,0.35))"><svg viewBox="0 0 36 36" width="32" height="32"><path d="M18 2C11 2 6 7.4 6 13.8 6 23 18 34 18 34s12-11 12-20.2C30 7.4 25 2 18 2z" fill="${color}" stroke="rgba(23,19,15,0.25)" stroke-width="1.5"/><circle cx="18" cy="13.5" r="4.5" fill="#ffffff"/></svg></span>`;
}

export function DispatchMapDialog({
  open,
  onClose,
  title,
  center,
  circleKm,
  markers,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  center: LatLng;
  circleKm?: number;
  markers: MapMarker[];
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const start: [number, number] = [center.lat, center.lng];
    const map = L.map(containerRef.current, { center: start, zoom: circleKm ? 12 : 13, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    if (circleKm) {
      L.circle(start, {
        radius: circleKm * 1000,
        color: "#C8963C",
        weight: 2,
        dashArray: "6 6",
        fillColor: "#C8963C",
        fillOpacity: 0.12,
      })
        .addTo(map)
        .bindTooltip(`${circleKm} km`);
    }
    const points: [number, number][] = [start];
    for (const marker of markers) {
      const at: [number, number] = [marker.lat, marker.lng];
      points.push(at);
      L.marker(at, {
        icon: L.divIcon({
          className: "wajbati-map-pin",
          html: pinHtml(marker.color ?? "#C8963C"),
          iconSize: [32, 32],
          iconAnchor: [16, 30],
        }),
      })
        .addTo(map)
        .bindTooltip(marker.label ?? "");
    }
    if (points.length > 1) {
      L.polyline(points, { color: "#A44E32", weight: 3, dashArray: "2 8", opacity: 0.85 }).addTo(map);
      map.fitBounds(L.latLngBounds(points).pad(0.25));
    }
    const timer = window.setTimeout(() => map.invalidateSize(), 260);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="dispatch-map"
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line/70 bg-card shadow-lux-lg sm:rounded-3xl"
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
              <h2 className="font-display text-2xl">{title}</h2>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-gold/10"
                aria-label={t("order.close")}
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <div ref={containerRef} className="h-[52dvh] w-full bg-surface sm:h-[48vh]" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
