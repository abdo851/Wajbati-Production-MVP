"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageDialog, LanguageMenu, useI18n } from "@/components/language";
import { Sidebar } from "@/components/sidebar";
import { useSession } from "@/components/use-session";

function Mark() {
  return (
    <svg viewBox="0 0 40 40" className="size-9 drop-shadow-[0_4px_20px_rgba(30,26,21,0.08)]" aria-hidden="true">
      <rect width="40" height="40" rx="14" className="fill-terracotta" />
      <path d="M9 25c0-6.2 4.8-11 11-11s11 4.8 11 11v1.5H9V25z" className="fill-white" />
      <path d="M14 14.5c1.4-3.6 10.6-3.6 12 0" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="8.5" r="1.5" className="fill-saffron" />
    </svg>
  );
}

export function ProfilePhoto({ src, label, className = "size-11" }: { src?: string | null; label: string; className?: string }) {
  return (
    <span className={`inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#F3EBE1] text-foreground shadow-[0_4px_20px_rgba(30,26,21,0.08)] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" className="size-1/2" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19.2c1.4-3 3.8-4.5 7-4.5s5.6 1.5 7 4.5" strokeLinecap="round" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function MenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card shadow-[0_4px_20px_rgba(30,26,21,0.08)]"
      aria-expanded={open}
      aria-label={t("menu.open")}
      onClick={onClick}
    >
      <span className="flex w-4 flex-col gap-1" aria-hidden="true">
        <span className="h-0.5 rounded-full bg-foreground" />
        <span className="h-0.5 rounded-full bg-foreground" />
        <span className="h-0.5 rounded-full bg-foreground" />
      </span>
    </button>
  );
}

export function SiteHeader() {
  const { lang, t } = useI18n();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user ?? null;
  const name = user?.fullName;
  const deskHref = user?.role === "chef" ? "/chef" : user?.role === "driver" ? "/driver" : null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/80 bg-background/80 shadow-[0_4px_20px_rgba(30,26,21,0.08)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <MenuButton open={open} onClick={() => setOpen(true)} />
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Mark />
            <span className="truncate font-display text-2xl leading-none">{lang === "ar" ? "وجبتي" : "Wajbati"}</span>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            {deskHref ? (
              <Link href={deskHref} aria-label={t("header.profile")} className="inline-flex rounded-full">
                <ProfilePhoto src={user?.avatarDataUrl} label={t("header.profile")} />
              </Link>
            ) : null}
            <LanguageMenu />
            {name && !deskHref ? (
              <Link href="/account" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground md:inline">
                {name}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <LanguageDialog />
    </>
  );
}

export function SiteFooter() {
  const { t, lang } = useI18n();
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-base text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{lang === "ar" ? "وجبتي" : "Wajbati"}</p>
        <p className="flex flex-wrap gap-3">
          <Link href="/terms">{t("footer.terms")}</Link>
          <Link href="/privacy">{t("footer.privacy")}</Link>
        </p>
        <p>{t("footer.note")}</p>
      </div>
    </footer>
  );
}
