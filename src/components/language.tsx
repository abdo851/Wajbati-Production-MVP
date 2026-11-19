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
    setFormatLang(lang);
  }, [lang]);

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
      className="inline-flex min-h-10 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-full border border-line/90 bg-white/85 px-2 text-[11px] font-semibold text-ink shadow-[0_6px_14px_-12px_rgba(23,19,15,0.5)] transition duration-200 hover:border-gold/55 hover:bg-gold/5 sm:max-w-none sm:min-h-11 sm:gap-2 sm:px-3.5 sm:text-sm"
      aria-haspopup="dialog"
      aria-expanded={languageOpen}
      aria-label={t("lang.label")}
      onClick={openLanguage}
    >
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9z" />
      </svg>
      <span className="max-w-[4.5rem] truncate sm:max-w-none">
        {t(lang === "ar" ? "lang.ar" : lang === "fr" ? "lang.fr" : "lang.en")}
      </span>
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
        className="relative z-10 w-full max-w-[300px] rounded-[1.35rem] border border-line bg-[color:rgb(255_252_248_/0.94)] p-4 shadow-lux-lg backdrop-blur-xl"
        initial={{ opacity: 0, scale: 0.94, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <h2 id="language-title" className="font-display text-lg text-ink">
          {t("lang.preferred")}
        </h2>
        <div className="mt-3 grid gap-2">
          {choices.map((choice) => {
            const active = choice.id === lang;
            return (
              <button
                key={choice.id}
                type="button"
                className={`flex min-h-12 items-center justify-between rounded-2xl border px-3.5 text-start transition ${
                  active
                    ? "border-gold/70 bg-gold/10"
                    : "border-line bg-white hover:border-gold/40 hover:bg-gold/5"
                }`}
                aria-pressed={active}
                onClick={() => {
                  setLang(choice.id);
                  closeLanguage();
                }}
              >
                <span>
                  <span className="block text-sm font-semibold text-ink sm:text-base">{t(choice.label)}</span>
                  <span className="block text-xs text-[color:var(--muted-strong)]">{t(choice.hint)}</span>
                </span>
                {active ? (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
