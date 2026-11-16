"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/components/language";

export function SplashScreen() {
  const { lang } = useI18n();
  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
      aria-hidden="true"
    >
      <motion.svg
        viewBox="0 0 40 40"
        className="size-20 drop-shadow-[0_10px_30px_rgba(169,127,44,0.45)]"
        animate={{ scale: [1, 1.1, 1], rotate: [0, 0, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="splash-gold" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#DDB964" />
            <stop offset="1" stopColor="#A97F2C" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="14" fill="url(#splash-gold)" />
        <path d="M9 25c0-6.2 4.8-11 11-11s11 4.8 11 11v1.5H9V25z" className="fill-white" />
        <path d="M14 14.5c1.4-3.6 10.6-3.6 12 0" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </motion.svg>
      <motion.p
        className="gold-text mt-5 font-display text-4xl"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        {lang === "ar" ? "وجبتي" : "Wajbati"}
      </motion.p>
      <motion.span
        className="mt-8 size-9 rounded-full border-2 border-gold/30 border-t-gold"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
      />
    </motion.div>
  );
}
