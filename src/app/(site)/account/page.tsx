import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";

export const metadata: Metadata = {
  title: "Profile",
};

export default function AccountPage() {
  return <AccountPanel />;
}
