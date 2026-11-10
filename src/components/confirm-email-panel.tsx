"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";

export function ConfirmEmailPanel() {
  const { t } = useI18n();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!token) {
        setState("bad");
        return;
      }
      void fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((response) => setState(response.ok ? "ok" : "bad"))
        .catch(() => setState("bad"));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [token]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">{state === "ok" ? t("auth.confirmed") : state === "bad" ? t("auth.confirmInvalid") : t("auth.checking")}</h1>
      <div className="mt-6">
        {state === "ok" ? (
          <Link href="/" className={primaryButtonClass}>
            {t("nav.meals")}
          </Link>
        ) : null}
        {state === "bad" ? (
          <Link href="/chef" className={primaryButtonClass}>
            {t("auth.resend")}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
