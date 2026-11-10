"use client";

import { useState } from "react";
import { useI18n } from "@/components/language";
import { inputClass } from "@/components/ui";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-base">
      <span className="mb-1.5 block font-medium">{label}</span>
      <span className="relative block">
        <input
          className={`${inputClass} pe-14`}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          className="absolute inset-y-1 end-1 inline-flex items-center rounded-xl px-3 text-muted hover:text-foreground"
          aria-pressed={visible}
          aria-label={visible ? t("auth.hide") : t("auth.show")}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </span>
    </label>
  );
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9.5 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.6M6.1 6.8C3.5 8.6 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
