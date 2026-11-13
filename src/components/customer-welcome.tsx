"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";

export const VISIT_KEY = "wajbati_visit_intent";

export function CustomerWelcome() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "join">("choose");
  const [email, setEmail] = useState("");
  const checked = useRef(false);
  const leadSent = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    try {
      setOpen(window.localStorage.getItem(VISIT_KEY) == null);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  function choose(intent: "order" | "join") {
    try {
      window.localStorage.setItem(VISIT_KEY, intent);
    } catch {
      return;
    }
    const trimmed = email.trim();
    if (trimmed.includes("@") && !leadSent.current) {
      leadSent.current = true;
      void fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "welcome" }),
      });
    }
    window.dispatchEvent(new Event("wajbati-visit"));
    if (intent === "order") {
      setOpen(false);
      return;
    }
    setStep("join");
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#1E1A15]/45 px-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-[0_12px_40px_rgba(30,26,21,0.18)]">
        <h2 id="welcome-title" className="font-display text-3xl leading-tight">
          {t("welcome.gateTitle")}
        </h2>
        {step === "choose" ? (
          <div className="mt-6 grid gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">{t("welcome.email")}</span>
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("welcome.email")} />
            </label>
            <button type="button" className={primaryButtonClass} onClick={() => choose("order")}>
              {t("welcome.orderOnly")}
            </button>
            <button type="button" className={quietButtonClass} onClick={() => choose("join")}>
              {t("welcome.join")}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <Link href="/chef" className={primaryButtonClass} onClick={() => setOpen(false)}>
              {t("welcome.asChef")}
            </Link>
            <Link href="/driver" className={quietButtonClass} onClick={() => setOpen(false)}>
              {t("welcome.asDriver")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
