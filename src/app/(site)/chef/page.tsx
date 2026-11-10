import type { Metadata } from "next";
import { ChefDashboard } from "@/components/chef-dashboard";

export const metadata: Metadata = {
  title: "مطبخ الطاهي",
};

export default function ChefPage() {
  return <ChefDashboard />;
}
