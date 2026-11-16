import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  title: "Profile",
};

export default function AccountPage() {
  return (
    <>
      <BackButton />
      <AccountPanel />
    </>
  );
}
