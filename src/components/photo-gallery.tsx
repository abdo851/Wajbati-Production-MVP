"use client";

import { useState, type ChangeEvent } from "react";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";

export function PhotoGallery({ images, onChange }: { images: string[]; onChange: (next: string[]) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (images.length >= 5 || file.size > 400 * 1024) {
      setError(t("gallery.limit"));
      return;
    }
    const image = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!image?.startsWith("data:image/")) return;
    setError(null);
    const response = await fetch("/api/profile/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const body = await readJson<{ gallery: string[] }>(response);
    onChange(body.gallery);
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{t("gallery.title")}</h3>
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line px-3 text-sm font-medium">
          {t("gallery.add")}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void add(event)} />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-terracotta-deep">{error}</p> : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {images.map((src) => (
          <span key={src.slice(0, 48)} className="aspect-square overflow-hidden rounded-2xl bg-[#F3EBE1]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
          </span>
        ))}
      </div>
    </section>
  );
}

export function PenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute -bottom-1 -end-1 inline-flex size-8 items-center justify-center rounded-full border border-line bg-card text-terracotta shadow-[0_4px_12px_rgba(30,26,21,0.12)]"
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
        <path d="M13 7l4 4" />
      </svg>
    </button>
  );
}
