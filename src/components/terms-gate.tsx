"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
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
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    setOpen(!hasAgreed());
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

  function agree() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      return;
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="terms-gate"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/60 px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-gate-title"
          onClick={(event) => event.stopPropagation()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="w-full max-w-lg rounded-3xl border border-line/70 bg-card/95 p-6 shadow-lux-lg backdrop-blur-xl sm:p-8"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <h2 id="terms-gate-title" className="font-display text-3xl text-foreground sm:text-4xl">
              {t("terms.welcome")}
            </h2>
            <p className="mt-4 text-base leading-8 text-muted">{t("terms.body")}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <motion.button type="button" className={primaryButtonClass} onClick={agree} whileTap={{ scale: 0.97 }}>
                {t("terms.agree")}
              </motion.button>
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-base font-semibold text-gold-deep underline underline-offset-4"
              >
                {t("terms.read")}
              </Link>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
