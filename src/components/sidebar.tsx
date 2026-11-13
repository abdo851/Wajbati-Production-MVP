"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { ProfilePhoto } from "@/components/site-header";
import { useSession } from "@/components/use-session";

const NOTICE_KEY = "wajbati_notifications";

const itemClass = "lift-card block w-full rounded-2xl px-4 py-3 text-start text-base";
const nestedClass = "block w-full rounded-2xl border border-[#E4D5C4] bg-[#F3EBE1] px-4 py-3 text-start text-base";

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

  if (!open) return null;

  const fromStart = dir === "rtl" ? "right-0" : "left-0";

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-foreground/40" aria-label={t("order.close")} onClick={onClose} />
      <aside
        className={`absolute top-0 ${fromStart} flex h-full w-[min(100%,22rem)] flex-col overflow-y-auto bg-background p-5 shadow-[0_4px_20px_rgba(30,26,21,0.08)]`}
        role="dialog"
        aria-modal="true"
        aria-label={t("menu.open")}
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-2xl">{t("menu.open")}</p>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg text-xl" onClick={onClose} aria-label={t("order.close")}>
            ×
          </button>
        </div>

        {user && (user.role === "chef" || user.role === "driver") ? (
          <div className="mt-6 grid gap-2">
            <Link href={user.role === "chef" ? "/chef" : "/driver"} className={`${itemClass} font-medium`} onClick={onClose}>
              {t("sidebar.myProfile")}
            </Link>
            <Link href={user.role === "chef" ? "/chef#orders" : "/driver#orders"} className={`${itemClass} font-medium`} onClick={onClose}>
              {t("menu.orders")}
            </Link>
            <button type="button" className={`${itemClass} text-start font-medium`} onClick={() => void signOut()}>
              {t("menu.signOut")}
            </button>
          </div>
        ) : (
          <>
            <section className="mt-6">
              <button
                type="button"
                className={`${itemClass} flex items-center justify-between font-medium`}
                aria-expanded={joinOpen}
                onClick={() => setJoinOpen((current) => !current)}
              >
                <span>{t("sidebar.join")}</span>
                <span aria-hidden="true">{joinOpen ? "–" : "+"}</span>
              </button>
              {joinOpen ? (
                <div className="mt-2 grid gap-2">
                  <Link href="/chef" className={nestedClass} onClick={onClose}>
                    {t("sidebar.chef")}
                  </Link>
                  <Link href="/driver" className={nestedClass} onClick={onClose}>
                    {t("sidebar.driver")}
                  </Link>
                </div>
              ) : null}
            </section>

            <section className="mt-4">
              {user ? (
                <>
                  <button
                    type="button"
                    className={`${itemClass} flex items-center justify-between font-medium`}
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((current) => !current)}
                  >
                    <span>{t("sidebar.account")}</span>
                    <span aria-hidden="true">{accountOpen ? "–" : "+"}</span>
                  </button>
                  {accountOpen ? (
                    <div className="mt-2 grid gap-2">
                      <Link href="/account" className={nestedClass} onClick={onClose}>
                        {t("menu.account")}
                      </Link>
                      <Link href="/account#orders" className={nestedClass} onClick={onClose}>
                        {t("menu.orders")}
                      </Link>
                      <button type="button" className={nestedClass} onClick={() => void signOut()}>
                        {t("menu.signOut")}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <Link href="/account" className={`${itemClass} font-medium`} onClick={onClose}>
                  {t("sidebar.account")}
                </Link>
              )}
            </section>

            <section className="mt-6">
              <h2 className="px-1 text-sm font-medium text-muted">{t("sidebar.settings")}</h2>
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
              <h2 className="px-1 text-sm font-medium text-muted">{t("sidebar.legal")}</h2>
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
              <p className="min-w-0 truncate font-medium">{user.fullName}</p>
            </div>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
