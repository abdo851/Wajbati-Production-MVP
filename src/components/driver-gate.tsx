"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DriverAuth } from "@/components/driver-auth";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";

export function DriverGate() {
  const { t } = useI18n();
  const router = useRouter();
  const { session, error } = useSession();

  useEffect(() => {
    document.title = `${t("nav.drive")} · Wajbati`;
  }, [t]);

  useEffect(() => {
    if (session?.user?.role === "driver") {
      router.replace("/driver/dashboard");
    }
  }, [router, session]);

  if (error && !session) {
    return <p className="px-4 py-16 text-sm text-terracotta-deep">{error}</p>;
  }
  if (!session) {
    return <p className="px-4 py-16 text-sm text-muted">{t("driver.checking")}</p>;
  }
  if (session.user?.role === "driver") {
    return <p className="px-4 py-16 text-sm text-muted">{t("gate.opening")}</p>;
  }
  return <DriverAuth />;
}
