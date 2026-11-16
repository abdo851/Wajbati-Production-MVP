"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ChefHat, Bike } from "lucide-react";
import { useI18n } from "@/components/language";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function JoinIntro() {
  const { t } = useI18n();
  const cards = [
    {
      href: "/chef",
      icon: ChefHat,
      title: t("join.chef"),
      body: t("join.chefBody"),
      cta: t("join.chefCta"),
    },
    {
      href: "/driver",
      icon: Bike,
      title: t("join.driver"),
      body: t("join.driverBody"),
      cta: t("join.driverCta"),
    },
  ] as const;

  return (
    <div>
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.p variants={item} className="gold-text text-sm font-bold tracking-wide">
          {t("join.kicker")}
        </motion.p>
        <motion.h1 variants={item} className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          {t("join.title")}
        </motion.h1>
        <motion.p variants={item} className="mt-4 max-w-2xl text-base leading-8 text-muted">
          {t("join.subtitle")}
        </motion.p>
      </motion.div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {cards.map((card) => (
          <motion.div key={card.href} variants={item} initial="hidden" animate="show" whileHover={{ y: -8 }} whileTap={{ scale: 0.98 }}>
            <Link
              href={card.href}
              className="lift-card group flex h-full flex-col rounded-3xl p-7 transition-shadow duration-300 hover:shadow-lux-lg sm:p-9"
            >
              <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-l from-gold to-gold-deep text-white shadow-[0_10px_24px_-10px_rgba(169,127,44,0.8)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                <card.icon className="size-7" strokeWidth={1.8} />
              </span>
              <h2 className="mt-6 font-display text-3xl">{card.title}</h2>
              <p className="mt-3 flex-1 text-base leading-8 text-muted">{card.body}</p>
              <span className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-l from-gold to-gold-deep px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(169,127,44,0.8)] transition duration-200 group-hover:brightness-105">
                {card.cta}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
