import type { Metadata } from "next";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { ParticipantCasesPanel } from "@/components/participant-cases-panel";

export const metadata: Metadata = {
  title: "Moderation cases",
};

export default function AccountCasesPage() {
  return (
    <>
      <BackButton />
      <Suspense fallback={<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8" />}>
        <ParticipantCasesPanel />
      </Suspense>
    </>
  );
}
