"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { LAUNCH_CITIES, neighborhoodsForCity } from "@/lib/marketplace/launch-geography";
import type { MarketplaceListingRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

const MAX_IMAGE_CHARS = 900_000;

async function readImageAsDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("image"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith("data:image/")) throw new Error("image");
  if (dataUrl.length > MAX_IMAGE_CHARS) throw new Error("image-size");
  return dataUrl;
}

export function MarketplaceSellerPanel({ city }: { city: string }) {
  const { t, lang } = useI18n();
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<"permanent" | "temporary">("permanent");
  const [priceMode, setPriceMode] = useState<"fixed" | "negotiable" | "hidden">("fixed");
  const [listingCity, setListingCity] = useState(city || LAUNCH_CITIES[0]?.name || "Rabat");
  const [neighborhood, setNeighborhood] = useState("");
  const [accepting, setAccepting] = useState(true);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/marketplace/listings?mine=1", { cache: "no-store" });
    const body = await readJson<{ listings: MarketplaceListingRecord[] }>(response);
    setListings(body.listings);
  }

  async function pushPresence(nextAccepting?: boolean) {
    const response = await fetch("/api/marketplace/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acceptingInquiries: typeof nextAccepting === "boolean" ? nextAccepting : accepting,
      }),
    });
    const body = await readJson<{ presence?: { acceptingInquiries?: boolean } }>(response);
    if (typeof body.presence?.acceptingInquiries === "boolean") {
      setAccepting(body.presence.acceptingInquiries);
    }
  }

  useEffect(() => {
    void reload().catch(() => undefined);
    void pushPresence().catch(() => undefined);
    const beat = window.setInterval(() => {
      void pushPresence().catch(() => undefined);
    }, 45_000);
    return () => window.clearInterval(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const options = neighborhoodsForCity(listingCity);
    if (options.length && !options.some((item) => item.name === neighborhood)) {
      setNeighborhood(options[0]?.name || "");
    }
  }, [listingCity, neighborhood]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const file = form.get("photo");
      let images: string[] = photoPreview ? [photoPreview] : [];
      if (file instanceof File && file.size > 0) {
        images = [await readImageAsDataUrl(file)];
      }
      const response = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          category: form.get("category") || "home",
          kind,
          priceMode,
          priceMad: priceMode === "fixed" ? Number(form.get("priceMad")) : null,
          availability: form.get("availability") || "available",
          expiresAt: kind === "temporary" ? form.get("expiresAt") : null,
          city: listingCity || form.get("city") || "",
          neighborhood,
          isPublished: true,
          images,
        }),
      });
      await readJson(response);
      event.currentTarget.reset();
      setPhotoPreview(null);
      setNotice(t("chef.mealSaved"));
      await reload();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message === "image-size" || message === "image" ? t("err.generic") : message || t("chef.updateFailed"));
    } finally {
      setPending(false);
    }
  }

  const neighborhoods = neighborhoodsForCity(listingCity);

  return (
    <section className="mt-8 rounded-3xl border border-line bg-card p-5 shadow-lux">
      <h2 className="font-display text-3xl">{t("market.publishTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("market.publishHint")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/60 p-3">
        <p className="text-sm font-semibold">{t("market.sellerAvailability")}</p>
        <button
          type="button"
          className={accepting ? primaryButtonClass : quietButtonClass}
          disabled={pending}
          onClick={() => {
            const next = !accepting;
            setAccepting(next);
            void pushPresence(next).catch(() => setAccepting(!next));
          }}
        >
          {accepting ? t("market.setAccepting") : t("market.setNotAccepting")}
        </button>
        <p className="text-xs text-muted">{t("market.online")} · heartbeat</p>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("chef.fieldTitle")}</span>
          <input className={inputClass} name="title" required minLength={3} maxLength={80} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("chef.fieldDescription")}</span>
          <textarea className={`${inputClass} min-h-28`} name="description" required minLength={10} maxLength={800} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("market.fieldPhoto")}</span>
          <input
            className={inputClass}
            name="photo"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setPhotoPreview(null);
                return;
              }
              void readImageAsDataUrl(file)
                .then(setPhotoPreview)
                .catch(() => setPhotoPreview(null));
            }}
          />
        </label>
        {photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreview} alt="" className="h-28 w-full rounded-2xl object-cover" />
        ) : null}
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("market.fieldCategory")}</span>
          <input className={inputClass} name="category" defaultValue="home" maxLength={40} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("chef.city")}</span>
            <select className={inputClass} value={listingCity} onChange={(event) => setListingCity(event.target.value)}>
              {LAUNCH_CITIES.map((entry) => (
                <option key={entry.id} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("market.fieldNeighborhood")}</span>
            <select className={inputClass} value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)}>
              {neighborhoods.map((entry) => (
                <option key={entry.id} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("market.fieldKind")}</span>
            <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="permanent">{t("market.kind.permanent")}</option>
              <option value="temporary">{t("market.kind.temporary")}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("market.fieldPriceMode")}</span>
            <select
              className={inputClass}
              value={priceMode}
              onChange={(event) => setPriceMode(event.target.value as typeof priceMode)}
            >
              <option value="fixed">{t("chef.fieldPrice")}</option>
              <option value="negotiable">{t("market.price.negotiable")}</option>
              <option value="hidden">{t("market.price.hidden")}</option>
            </select>
          </label>
        </div>
        {priceMode === "fixed" ? (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("chef.fieldPrice")}</span>
            <input className={inputClass} name="priceMad" type="number" min={1} max={5000} step="0.5" required />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("market.fieldAvailability")}</span>
          <select className={inputClass} name="availability" defaultValue="available">
            <option value="available">{t("market.avail.available")}</option>
            <option value="preorder">{t("market.avail.preorder")}</option>
            <option value="unavailable">{t("market.avail.unavailable")}</option>
            <option value="sold_out">{t("market.avail.sold_out")}</option>
          </select>
        </label>
        {kind === "temporary" ? (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("market.fieldExpires")}</span>
            <input className={inputClass} name="expiresAt" type="datetime-local" required />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-terracotta-deep">
            {error}
          </p>
        ) : null}
        {notice ? <p className="text-sm text-olive">{notice}</p> : null}
        <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending}>
          {pending ? t("chef.publishing") : t("chef.publish")}
        </button>
      </form>

      <ul className="mt-6 space-y-3">
        {listings.map((listing) => (
          <li key={listing.id} className="rounded-2xl border border-line bg-surface/50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{listing.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {listing.kind === "temporary" ? t("market.kind.temporary") : t("market.kind.permanent")} ·{" "}
                  {listing.priceMode === "fixed" && listing.priceMad != null
                    ? formatMad(listing.priceMad, lang)
                    : listing.priceMode === "negotiable"
                      ? t("market.price.negotiable")
                      : t("market.price.hidden")}
                  {listing.neighborhood ? ` · ${listing.neighborhood}` : ""}
                </p>
              </div>
              <button
                type="button"
                className={quietButtonClass}
                onClick={() =>
                  void fetch(`/api/marketplace/listings/${listing.id}`, { method: "DELETE" })
                    .then(() => reload())
                    .catch(() => undefined)
                }
              >
                {t("chef.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
