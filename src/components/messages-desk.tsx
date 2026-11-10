"use client";

import Link from "next/link";
import { useEffect } from "react";
import { OwnChat } from "@/components/chat-panel";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";
import { useSession } from "@/components/use-session";

export function MessagesDesk() {
  const { t } = useI18n();
  const { session, error } = useSession();

  useEffect(() => {
    document.title = `${t("chat.title")} · Wajbati`;
  }, [t]);

  if (error && !session) return <p className="px-4 py-16 text-sm text-terracotta-deep">{error}</p>;
  if (!session) return <p className="px-4 py-16 text-sm text-muted">{t("gate.checking")}</p>;
  if (session.user?.role !== "chef" && session.user?.role !== "driver") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl">{t("chat.protected")}</h1>
        <Link href="/" className={`${primaryButtonClass} mt-6`}>{t("gate.openDashboard")}</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <OwnChat />
    </main>
  );
}
