"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { setFormatLang } from "@/lib/format";
import { translate, type Lang, type MessageKey } from "@/lib/i18n";

type LanguageValue = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  languageOpen: boolean;
  openLanguage: () => void;
  closeLanguage: () => void;
};

const LanguageContext = createContext<LanguageValue | null>(null);
const STORAGE_KEY = "wajbati_lang";

function storedLang(): Lang | null {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "ar" || saved === "en" || saved === "fr") return saved;
  const match = document.cookie.match(/(?:^|; )wajbati_lang=(ar|en|fr)/);
  if (match?.[1] === "en" || match?.[1] === "fr" || match?.[1] === "ar") return match[1];
  return null;
}

function applyLang(next: Lang) {
  document.cookie = `wajbati_lang=${next}; path=/; max-age=31536000; samesite=lax`;
  window.localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    const stored = storedLang();
    const timeout = window.setTimeout(() => {
      if (stored) setLangState(stored);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  setFormatLang(lang);

  const value = useMemo<LanguageValue>(() => {
    return {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang(next) {
        setLangState(next);
        applyLang(next);
      },
      t(key, vars) {
        return translate(lang, key, vars);
      },
      languageOpen,
      openLanguage() {
        setLanguageOpen(true);
      },
      closeLanguage() {
        setLanguageOpen(false);
      },
    };
  }, [lang, languageOpen]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("LanguageProvider is missing.");
  }
  return value;
}

export const useLanguage = useI18n;

const choices: Array<{ id: Lang; label: MessageKey; hint: MessageKey }> = [
  { id: "ar", label: "lang.ar", hint: "lang.arHint" },
  { id: "en", label: "lang.en", hint: "lang.enHint" },
  { id: "fr", label: "lang.fr", hint: "lang.frHint" },
];

export function LanguageMenu() {
  const { lang, t, languageOpen, openLanguage } = useI18n();

  return (
    <button
      type="button"
      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2 text-[11px] font-semibold text-foreground shadow-[0_8px_16px_-12px_rgba(90,48,20,0.8)] transition duration-200 hover:border-gold/60 hover:bg-gold/5 sm:min-h-11 sm:gap-1.5 sm:px-3 sm:text-sm"
      aria-haspopup="dialog"
      aria-expanded={languageOpen}
      aria-label={t("lang.label")}
      onClick={openLanguage}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9z" />
      </svg>
      <span>{t(lang === "ar" ? "lang.ar" : lang === "fr" ? "lang.fr" : "lang.en")}</span>
    </button>
  );
}

export function LanguageDialog() {
  const { lang, setLang, t, languageOpen, closeLanguage } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!languageOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeLanguage();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [languageOpen, closeLanguage]);

  if (!mounted || !languageOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-24 sm:pt-28" role="presentation">
      <motion.button
        type="button"
        className="absolute inset-0 bg-ink/35 backdrop-blur-md"
        aria-label={t("order.close")}
        onClick={closeLanguage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-title"
        className="relative z-10 w-full max-w-[300px] rounded-3xl border border-white/60 bg-white/75 p-4 shadow-lux-lg backdrop-blur-xl"
        initial={{ opacity: 0, scale: 0.92, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <h2 id="language-title" className="font-display text-xl">
          {t("lang.preferred")}
        </h2>
        <div className="mt-3 grid gap-2">
          {choices.map((choice) => {
            const active = choice.id === lang;
            return (
              <button
                key={choice.id}
                type="button"
                className={`lift-card flex min-h-11 items-center justify-between rounded-2xl px-3.5 text-start ${active ? "border-gold" : ""}`}
                aria-pressed={active}
                onClick={() => {
                  setLang(choice.id);
                  closeLanguage();
                }}
              >
                <span>
                  <span className="block text-base font-semibold">{t(choice.label)}</span>
                  <span className="block text-xs text-muted">{t(choice.hint)}</span>
                </span>
                {active ? <span className="font-bold text-gold-deep" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
