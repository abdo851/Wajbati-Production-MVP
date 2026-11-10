"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";

const STORAGE_KEY = "wajbati_terms_accepted";

export function TermsGate() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "true") setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function blockEscape(event: KeyboardEvent) {
      if (event.key === "Escape") event.preventDefault();
    }
    window.addEventListener("keydown", blockEscape);
    return () => window.removeEventListener("keydown", blockEscape);
  }, [open]);

  if (!open || pathname === "/terms" || pathname === "/privacy") return null;

  function agree() {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1A15]/50 px-4" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-card p-6 shadow-[0_12px_40px_rgba(30,26,21,0.18)] sm:p-8">
        <h2 id="terms-gate-title" className="font-display text-3xl text-foreground sm:text-4xl">
          {t("terms.welcome")}
        </h2>
        <p className="mt-4 text-base leading-8 text-muted">{t("terms.body")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButtonClass} onClick={agree}>
            {t("terms.agree")}
          </button>
          <Link href="/terms" className="inline-flex min-h-11 items-center text-base font-medium text-terracotta-deep underline">
            {t("terms.read")}
          </Link>
        </div>
      </div>
    </div>
  );
}
