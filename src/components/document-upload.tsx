"use client";

import { useState } from "react";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";
import { requiredDocumentKinds, sharpPhotoSize } from "@/lib/documents";
import { readJson } from "@/lib/read-json";
import type { DocumentKind, Vehicle } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";

const labels: Record<DocumentKind, MessageKey> = {
  cin_front: "driver.docs.cinFront",
  cin_back: "driver.docs.cinBack",
  license: "driver.docs.license",
  vehicle_papers: "driver.docs.papers",
};

export function DocumentUpload({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const { t } = useI18n();
  const kinds = requiredDocumentKinds(vehicle);
  const [files, setFiles] = useState<Partial<Record<DocumentKind, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<DocumentKind, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ready = kinds.every((kind) => files[kind]);

  async function send() {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      for (const kind of kinds) {
        const file = files[kind];
        if (!file) continue;
        if (!sharpPhotoSize(file.size)) throw new Error(t("photo.quality"));
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        const response = await fetch("/api/driver/documents", { method: "POST", body });
        await readJson(response);
      }
      onDone();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("driver.docs.need");
      setError(message.includes("high-quality") ? t("photo.quality") : message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="lift-card space-y-4 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-3xl">{t("driver.docsTitle")}</h2>
      <p className="text-base leading-7 text-muted">{vehicle === "bike" ? t("driver.docsBike") : t("driver.docsLicensed")}</p>
      {kinds.map((kind) => (
        <label key={kind} className="block text-base">
          <span className="mb-1.5 block font-medium">{t(labels[kind])}</span>
          <input
            className="block w-full text-sm text-muted file:me-3 file:rounded-lg file:border-0 file:bg-saffron file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && !sharpPhotoSize(file.size)) {
                setError(t("photo.quality"));
                event.target.value = "";
                setFiles((current) => ({ ...current, [kind]: undefined }));
                return;
              }
              setError(null);
              setFiles((current) => ({ ...current, [kind]: file }));
              setPreviews((current) => {
                const previous = current[kind];
                if (previous) URL.revokeObjectURL(previous);
                return { ...current, [kind]: file ? URL.createObjectURL(file) : undefined };
              });
            }}
          />
          {previews[kind] ? (
            <span className="mt-2 block aspect-square w-full max-w-40 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[kind]} alt="" className="h-full w-full rounded-lg object-cover" />
            </span>
          ) : null}
        </label>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      <button type="button" className={`${primaryButtonClass} w-full`} disabled={!ready || pending} onClick={() => void send()}>
        {pending ? t("driver.docs.sending") : t("driver.docs.send")}
      </button>
    </section>
  );
}
