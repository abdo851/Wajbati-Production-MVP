"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { marketplaceVisibility } from "@/lib/marketplace-visibility";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { session } = useSession();
  const reduceMotion = useReducedMotion();
  // Defer session-dependent hrefs and framer-motion until after mount so SSR
  // HTML matches the first client paint (session / useReducedMotion / layoutId).
  const [navReady, setNavReady] = useState(false);
  useEffect(() => {
    setNavReady(true);
  }, []);
  if (pathname.startsWith("/admin") || pathname.startsWith("/driver")) return null;

  const role = session?.user?.role;
  const accountHref = !navReady
    ? "/account"
    : role === "chef"
      ? "/chef"
      : role === "driver"
        ? "/driver/dashboard"
        : role === "admin"
          ? "/admin"
          : "/account";
  const showOrders = marketplaceVisibility.showCustomerMealOrderFlow;

  const items = [
    { href: "/", label: t("nav.home"), icon: HomeIcon, match: "exact" as const },
    ...(showOrders
      ? [{ href: "/orders", label: t("nav.orders"), icon: OrdersIcon, match: "prefix" as const }]
      : []),
    { href: "/following", label: t("nav.following"), icon: HeartIcon, match: "prefix" as const },
    { href: accountHref, label: t("nav.account"), icon: UserIcon, match: "account" as const },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 start-0 end-0 z-40 box-border w-full max-w-full border-t border-line/80 bg-[color:rgb(255_253_250_/0.94)] pb-safe shadow-[0_-10px_36px_-20px_rgba(23,19,15,0.22)] backdrop-blur-xl md:hidden"
      aria-label={t("nav.home")}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1.5 pt-1.5 pb-1">
        {items.map((item) => {
          const active =
            item.match === "exact"
              ? pathname === "/"
              : item.match === "account"
                ? pathname === accountHref ||
                  (accountHref === "/account" && pathname.startsWith("/account")) ||
                  (accountHref === "/chef" && (pathname === "/chef" || pathname.startsWith("/chef/"))) ||
                  (accountHref === "/driver/dashboard" && pathname.startsWith("/driver")) ||
                  (accountHref === "/admin" && pathname.startsWith("/admin"))
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="relative flex-1">
              {active && !navReady ? (
                <span className="absolute inset-x-1 inset-y-0 rounded-2xl bg-brand/12" aria-hidden="true" />
              ) : null}
              {active && navReady ? (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  className="absolute inset-x-1 inset-y-0 rounded-2xl bg-brand/12"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              ) : null}
              <Link
                href={item.href}
                className={`relative flex min-h-[3.35rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[10px] font-semibold tracking-wide transition-colors duration-200 sm:text-[11px] ${
                  active ? "text-ink" : "text-[color:var(--muted-strong)]"
                }`}
              >
                <item.icon active={active} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.35rem]"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? "1.7" : "1.55"}
      aria-hidden="true"
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function OrdersIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.35rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "1.85" : "1.55"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13l-3-1.5-3 1.5-3-1.5-3 1.5V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.35rem]"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.55"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.8C19 15.6 12 20 12 20Z" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.35rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "1.85" : "1.55"}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.2" fill={active ? "currentColor" : "none"} />
      <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
    </svg>
  );
}
