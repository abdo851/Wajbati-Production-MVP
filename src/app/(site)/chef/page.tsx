import type { Metadata } from "next";
import { ChefDashboard } from "@/components/chef-dashboard";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  title: "مطبخ الطاهي",
};

export default function ChefPage() {
  return (
    <>
      <BackButton />
      <ChefDashboard />
    </>
  );
}
