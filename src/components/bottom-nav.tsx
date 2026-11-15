"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { session } = useSession();
  if (pathname.startsWith("/admin") || pathname.startsWith("/driver")) return null;
  const profileHref = session?.user?.role === "chef" ? "/chef" : session?.user?.role === "driver" ? "/driver/dashboard" : "/account";
  const items = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/following", label: t("nav.following"), icon: HeartIcon },
    { href: "/chef", label: t("nav.join"), icon: JoinIcon },
    { href: profileHref, label: t("nav.profile"), icon: UserIcon },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-safe backdrop-blur md:hidden" aria-label={t("nav.home")}>
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-medium ${active ? "text-terracotta" : "text-muted"}`}
              >
                <item.icon active={active} />
                <span>{item.label}</span>
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
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.6"} aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.8C19 15.6 12 20 12 20Z" />
    </svg>
  );
}

function JoinIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.6"} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 19c1.4-2.8 3.8-4.3 6.5-4.3 1.9 0 3.6.8 5 2.3" />
      <path d="M18 14.5v5" />
      <path d="M15.5 17h5" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.6"} aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
    </svg>
  );
}
