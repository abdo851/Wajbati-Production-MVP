import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketplaceInbox } from "@/components/marketplace-inbox";

export const metadata: Metadata = {
  title: "صندوق السوق",
};

export default function MarketplaceInboxPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm text-muted">…</main>}>
      <MarketplaceInbox />
    </Suspense>
  );
}
