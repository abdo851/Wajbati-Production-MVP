"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { ProfilePhoto } from "@/components/site-header";
import { useSession } from "@/components/use-session";
import { marketplaceVisibility } from "@/lib/marketplace-visibility";

const NOTICE_KEY = "wajbati_notifications";

const itemClass =
  "lift-card block w-full rounded-2xl px-4 py-3 text-start text-base transition duration-200 hover:border-gold/50";
const nestedClass =
  "block w-full rounded-2xl border border-line bg-surface/70 px-4 py-3 text-start text-base transition duration-200 hover:border-gold/50";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, dir, openLanguage } = useI18n();
  const { session, reload } = useSession();
  const [notes, setNotes] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!open) return;
    const stored = window.localStorage.getItem(NOTICE_KEY) === "1";
    const timeout = window.setTimeout(() => setNotes(stored), 0);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await reload();
    onClose();
  }

  const fromStart = dir === "rtl" ? "right-0" : "left-0";
  const slideFrom = dir === "rtl" ? "100%" : "-100%";

  return (
    <AnimatePresence>
      {open ? (
        <div key="sidebar" className="fixed inset-0 z-40">
          <motion.button
            type="button"
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            aria-label={t("order.close")}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            className={`absolute top-0 ${fromStart} flex h-full w-[min(100%,22rem)] flex-col overflow-y-auto border-line bg-background p-5 shadow-lux-lg`}
            role="dialog"
            aria-modal="true"
            aria-label={t("menu.open")}
            initial={{ x: slideFrom }}
            animate={{ x: 0 }}
            exit={{ x: slideFrom }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
        <div className="flex items-center justify-between">
          <p className="font-display text-2xl">{t("menu.open")}</p>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-full text-xl transition hover:bg-gold/10" onClick={onClose} aria-label={t("order.close")}>
            ×
          </button>
        </div>

        {user && (user.role === "chef" || user.role === "driver") ? (
          <div className="mt-6 grid gap-2">
            <Link
              href={user.role === "chef" ? "/chef" : "/driver/dashboard"}
              className={`${itemClass} font-semibold`}
              onClick={onClose}
            >
              {t("sidebar.myProfile")}
            </Link>
            <Link
              href={user.role === "chef" ? "/chef#orders" : "/driver/dashboard#orders"}
              className={`${itemClass} font-semibold`}
              onClick={onClose}
            >
              {t("menu.orders")}
            </Link>
            <button type="button" className={`${itemClass} text-start font-semibold`} onClick={() => void signOut()}>
              {t("menu.signOut")}
            </button>
          </div>
        ) : (
          <>
            <section className="mt-6">
              <button
                type="button"
                className={`${itemClass} flex items-center justify-between font-semibold`}
                aria-expanded={joinOpen}
                onClick={() => setJoinOpen((current) => !current)}
              >
                <span>{t("sidebar.join")}</span>
                <motion.span aria-hidden="true" animate={{ rotate: joinOpen ? 45 : 0 }} transition={{ duration: 0.18 }}>
                  +
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {joinOpen ? (
                  <motion.div
                    className="mt-2 grid gap-2 overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link href="/chef" className={nestedClass} onClick={onClose}>
                      {t("sidebar.chef")}
                    </Link>
                    {marketplaceVisibility.showCustomerDriverRecruitment ? (
                      <Link href="/driver" className={nestedClass} onClick={onClose}>
                        {t("sidebar.driver")}
                      </Link>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            <section className="mt-4">
              {user ? (
                <>
                  <button
                    type="button"
                    className={`${itemClass} flex items-center justify-between font-semibold`}
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((current) => !current)}
                  >
                    <span>{t("sidebar.account")}</span>
                    <motion.span aria-hidden="true" animate={{ rotate: accountOpen ? 45 : 0 }} transition={{ duration: 0.18 }}>
                      +
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {accountOpen ? (
                      <motion.div
                        className="mt-2 grid gap-2 overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <Link href="/account" className={nestedClass} onClick={onClose}>
                          {t("menu.account")}
                        </Link>
                        <Link href="/orders" className={nestedClass} onClick={onClose}>
                          {t("menu.orders")}
                        </Link>
                        <button type="button" className={nestedClass} onClick={() => void signOut()}>
                          {t("menu.signOut")}
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </>
              ) : (
                <Link href="/account" className={`${itemClass} font-semibold`} onClick={onClose}>
                  {t("sidebar.account")}
                </Link>
              )}
            </section>

            <section className="mt-6">
              <h2 className="px-1 text-sm font-semibold text-muted">{t("sidebar.settings")}</h2>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => {
                    onClose();
                    openLanguage();
                  }}
                >
                  {t("lang.preferred")}
                </button>
                <label className={`${itemClass} flex items-center justify-between gap-3`}>
                  <span>{t("sidebar.notifications")}</span>
                  <input
                    type="checkbox"
                    checked={notes}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setNotes(next);
                      window.localStorage.setItem(NOTICE_KEY, next ? "1" : "0");
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="mt-6">
              <h2 className="px-1 text-sm font-semibold text-muted">{t("sidebar.legal")}</h2>
              <div className="mt-2 grid gap-2">
                <Link href="/terms" className={itemClass} onClick={onClose}>
                  {t("sidebar.terms")}
                </Link>
                <Link href="/privacy" className={itemClass} onClick={onClose}>
                  {t("sidebar.privacy")}
                </Link>
              </div>
            </section>
          </>
        )}

        <footer className="mt-auto pt-8">
          {user ? (
            <div className="flex items-center gap-3">
              <ProfilePhoto src={user.avatarDataUrl} label={user.fullName} className="size-12" />
              <p className="min-w-0 truncate font-semibold">{user.fullName}</p>
            </div>
          ) : null}
        </footer>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
