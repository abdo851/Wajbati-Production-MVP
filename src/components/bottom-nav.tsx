"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { session } = useSession();
  const reduceMotion = useReducedMotion();
  if (pathname.startsWith("/admin") || pathname.startsWith("/driver")) return null;
  const profileHref =
    session?.user?.role === "chef"
      ? "/chef"
      : session?.user?.role === "driver"
        ? "/driver/dashboard"
        : "/account";
  const items = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/following", label: t("nav.following"), icon: HeartIcon },
    { href: "/join", label: t("nav.join"), icon: JoinIcon },
    { href: profileHref, label: t("nav.profile"), icon: UserIcon },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 start-0 end-0 z-40 box-border w-full max-w-full border-t border-line/80 bg-[color:rgb(255_253_250_/0.92)] pb-safe shadow-[0_-10px_36px_-20px_rgba(23,19,15,0.22)] backdrop-blur-xl md:hidden"
      aria-label={t("nav.home")}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-2 pt-1.5 pb-1">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={`${item.href}-${item.label}`} className="relative flex-1">
              {active ? (
                <motion.span
                  // Keep layoutId identical on server and client — toggling it via
                  // useReducedMotion() caused a hydration tree mismatch.
                  layoutId="bottom-nav-active-pill"
                  className="absolute inset-x-1 inset-y-0 rounded-2xl bg-gold/14"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              ) : null}
              <Link
                href={item.href}
                className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 text-[10px] font-semibold tracking-wide transition-colors duration-200 sm:text-[11px] ${
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

function JoinIcon({ active }: { active: boolean }) {
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
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 19c1.4-2.8 3.8-4.3 6.5-4.3 1.9 0 3.6.8 5 2.3" />
      <path d="M18 14.5v5" />
      <path d="M15.5 17h5" />
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
