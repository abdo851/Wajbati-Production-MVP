import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmEmailPanel } from "@/components/confirm-email-panel";

export const metadata: Metadata = { title: "تأكيد البريد" };

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<main className="px-4 py-16 text-base text-muted">…</main>}>
      <ConfirmEmailPanel />
    </Suspense>
  );
}
