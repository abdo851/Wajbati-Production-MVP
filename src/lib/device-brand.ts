"use client";

/** Brand name that strictly follows the device's system language (not the app language). */
export function getDeviceBrandName(): "ريغ" | "Righ" {
  if (typeof navigator === "undefined") return "Righ";
  return (navigator.language || "").toLowerCase().startsWith("ar") ? "ريغ" : "Righ";
}
