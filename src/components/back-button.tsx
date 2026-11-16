"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useI18n } from "@/components/language";

export function BackButton() {
  const router = useRouter();
  const { t, dir } = useI18n();
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileTap={{ scale: 0.95 }}
      className="glass fixed start-4 top-[4.25rem] z-30 inline-flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm font-semibold text-foreground shadow-lux"
      onClick={() => router.back()}
    >
      <svg
        viewBox="0 0 24 24"
        className={`size-4 ${dir === "rtl" ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m14 6-6 6 6 6" />
      </svg>
      {t("nav.back")}
    </motion.button>
  );
}
