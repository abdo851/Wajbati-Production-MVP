"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ChefHat, Bike } from "lucide-react";
import { useI18n } from "@/components/language";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

export function JoinIntro() {
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${t("nav.join")} · Righ`;
  }, [t]);

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
        <motion.p
          variants={item}
          className="text-[0.7rem] font-bold tracking-[0.16em] text-gold-deep uppercase"
        >
          {t("join.kicker")}
        </motion.p>
        <motion.h1
          variants={item}
          className="mt-2 max-w-[18ch] font-display text-[1.85rem] leading-[1.2] text-ink sm:max-w-2xl sm:text-4xl"
        >
          {t("join.title")}
        </motion.h1>
        <motion.p
          variants={item}
          className="mt-4 max-w-2xl text-[0.95rem] leading-7 text-[color:var(--muted-strong)] sm:text-base sm:leading-8"
        >
          {t("join.subtitle")}
        </motion.p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-2">
        {cards.map((card) => (
          <motion.div
            key={card.href}
            variants={item}
            initial="hidden"
            animate="show"
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.985 }}
          >
            <Link
              href={card.href}
              className="group flex h-full flex-col rounded-[1.35rem] border border-line bg-card p-6 transition-shadow duration-300 hover:shadow-lux sm:p-7"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-ink text-white transition-transform duration-300 group-hover:scale-[1.03]">
                <card.icon className="size-6" strokeWidth={1.7} />
              </span>
              <h2 className="mt-5 font-display text-2xl text-ink">{card.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-7 text-[color:var(--muted-strong)] sm:text-[0.95rem]">
                {card.body}
              </p>
              <span className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition duration-200 group-hover:bg-ink/90">
                {card.cta}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
