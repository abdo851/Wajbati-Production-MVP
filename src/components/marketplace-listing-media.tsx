"use client";

import { useState } from "react";

/** True when the asset is missing or too tiny to read as a real photo (e.g. 1×1 fixture pixels). */
export function isUsableListingImage(src: string | null | undefined): boolean {
  if (!src) return false;
  const value = src.trim();
  if (!value) return false;
  if (value.startsWith("data:image/") && value.length < 400) return false;
  return true;
}

export function MarketplaceListingMedia({
  src,
  alt = "",
  className = "",
  label,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Localized fallback caption, e.g. "Photo coming soon". */
  label: string;
}) {
  const usable = isUsableListingImage(src);
  const [failed, setFailed] = useState(false);
  const showImage = usable && !failed;

  return (
    <div className={`relative overflow-hidden bg-[linear-gradient(145deg,#F7F0E7_0%,#EFE4D6_48%,#E7D8C6_100%)] ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-2xl border border-[#D9C8B4]/80 bg-white/70 text-brand shadow-[0_8px_20px_-16px_rgba(111,20,32,0.45)]"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
              <path d="m8 14 2.2-2.2a1 1 0 0 1 1.4 0L14 14l1.2-1.2a1 1 0 0 1 1.4 0L18 14" />
              <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#8A7460]">{label}</p>
        </div>
      )}
    </div>
  );
}
