"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "@/components/language";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898];

const PIN_HTML = `<span style="display:block;width:36px;height:36px;filter:drop-shadow(0 6px 10px rgba(23,19,15,0.35))"><svg viewBox="0 0 36 36" width="36" height="36"><path d="M18 2C11 2 6 7.4 6 13.8 6 23 18 34 18 34s12-11 12-20.2C30 7.4 25 2 18 2z" fill="#C8963C" stroke="#A97F2C" stroke-width="1.5"/><circle cx="18" cy="13.5" r="4.5" fill="#ffffff"/></svg></span>`;

export function LocationPicker({
  open,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [coords, setCoords] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const start: [number, number] =
      typeof initialLat === "number" && typeof initialLng === "number" ? [initialLat, initialLng] : DEFAULT_CENTER;
    setCoords(start);
    const map = L.map(containerRef.current, { center: start, zoom: 15, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const icon = L.divIcon({ className: "wajbati-map-pin", html: PIN_HTML, iconSize: [36, 36], iconAnchor: [18, 33] });
    const marker = L.marker(start, { draggable: true, icon, autoPan: true }).addTo(map);
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      setCoords([ll.lat, ll.lng]);
    });
    map.on("click", (event) => {
      marker.setLatLng(event.latlng);
      setCoords([event.latlng.lat, event.latlng.lng]);
    });
    mapRef.current = map;
    markerRef.current = marker;
    const timer = window.setTimeout(() => map.invalidateSize(), 260);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open, initialLat, initialLng]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: [number, number] = [position.coords.latitude, position.coords.longitude];
        mapRef.current?.setView(next, 16);
        markerRef.current?.setLatLng(next);
        setCoords(next);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="location-picker"
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
              <h2 className="font-display text-2xl">{t("map.title")}</h2>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-gold/10"
                aria-label={t("order.close")}
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <div ref={containerRef} className="h-[52dvh] w-full bg-surface sm:h-[46vh]" />
            <div className="space-y-3 border-t border-line/70 px-5 py-4">
              <p className="text-sm text-muted">{t("map.hint")}</p>
              <p className="text-xs font-semibold text-gold-deep" dir="ltr">
                {t("map.selected")}: {coords[0].toFixed(6)}, {coords[1].toFixed(6)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={quietButtonClass} onClick={useMyLocation}>
                  <span className="inline-flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <circle cx="12" cy="12" r="7" />
                      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
                    </svg>
                    {t("map.myLocation")}
                  </span>
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => {
                    onConfirm(coords[0], coords[1]);
                    onClose();
                  }}
                >
                  {t("map.confirm")}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
