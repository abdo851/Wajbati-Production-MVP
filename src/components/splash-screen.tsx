"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { getDeviceBrandName } from "@/lib/device-brand";

export function SplashScreen() {
  const { t } = useI18n();
  const [brand, setBrand] = useState("Righ");

  useEffect(() => {
    const timeout = window.setTimeout(() => setBrand(getDeviceBrandName()), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-gradient-to-b from-[#FAF8F5] to-background px-4 text-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
      aria-hidden="true"
    >
      <div className="relative">
        <span className="absolute inset-0 m-auto size-32 rounded-full bg-gold/30 blur-2xl" aria-hidden="true" />
        <motion.span
          className="absolute -inset-4 rounded-[2rem] border-2 border-gold/25"
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
        />
        <motion.svg
          viewBox="0 0 40 40"
          className="relative size-24 drop-shadow-[0_12px_32px_rgba(169,127,44,0.5)]"
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="splash-gold" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#E3C169" />
              <stop offset="0.5" stopColor="#C8963C" />
              <stop offset="1" stopColor="#A97F2C" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="14" fill="url(#splash-gold)" />
          <path d="M9 25c0-6.2 4.8-11 11-11s11 4.8 11 11v1.5H9V25z" className="fill-white" />
          <path d="M14 14.5c1.4-3.6 10.6-3.6 12 0" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="8.5" r="1.5" className="fill-white" opacity="0.9" />
        </motion.svg>
      </div>
      <motion.p
        className="gold-text mt-6 whitespace-nowrap font-display text-4xl"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
      >
        {brand}
      </motion.p>
      <motion.p
        className="mt-3 max-w-xs text-sm font-medium leading-7 text-muted"
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
      >
        {t("splash.waiting")}
      </motion.p>
    </motion.div>
  );
}
