"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";

const STORAGE_KEY = "wajbati_terms_accepted";

function hasAgreed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function TermsGate() {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function sync() {
      setOpen(!hasAgreed());
    }
    sync();
    window.addEventListener("pageshow", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function blockEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("keydown", blockEscape, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", blockEscape, true);
    };
  }, [open]);

  if (!open) return null;

  function agree() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      return;
    }
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1E1A15]/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-lg rounded-3xl border border-line bg-card p-6 shadow-[0_12px_40px_rgba(30,26,21,0.18)] sm:p-8">
        <h2 id="terms-gate-title" className="font-display text-3xl text-foreground sm:text-4xl">
          {t("terms.welcome")}
        </h2>
        <p className="mt-4 text-base leading-8 text-muted">{t("terms.body")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButtonClass} onClick={agree}>
            {t("terms.agree")}
          </button>
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-base font-medium text-terracotta-deep underline"
          >
            {t("terms.read")}
          </Link>
        </div>
      </div>
    </div>
  );
}
