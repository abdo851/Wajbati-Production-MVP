import type { Metadata } from "next";
import { DriverDashboard } from "@/components/driver-dashboard";

export const metadata: Metadata = {
  title: "توصيل",
};

export default function DriverDashboardPage() {
  return <DriverDashboard />;
}
