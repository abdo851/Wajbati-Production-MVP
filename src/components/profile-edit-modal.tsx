"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { ProfileExtras } from "@/components/profile-extras";
import type { Role } from "@/lib/types";

export function ProfileEditModal({
  open,
  onClose,
  role,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  onSaved?: () => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="profile-edit"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line/70 bg-card shadow-lux-lg sm:rounded-3xl"
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
              <h2 className="font-display text-2xl">{t("profile.extras")}</h2>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-gold/10"
                aria-label={t("order.close")}
                onClick={onClose}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ProfileExtras
                role={role}
                onSaved={async () => {
                  await onSaved?.();
                  onClose();
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
