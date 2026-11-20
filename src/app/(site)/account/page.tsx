import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel } from "@/components/account-panel";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  title: "Profile",
};

export default function AccountPage() {
  return (
    <>
      <BackButton />
      <Suspense fallback={<main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6 sm:py-10" />}>
        <AccountPanel />
      </Suspense>
    </>
  );
}
