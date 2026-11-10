import type { Metadata } from "next";
import { DriverGate } from "@/components/driver-gate";

export const metadata: Metadata = {
  title: "توصيل",
};

export default function DriverPage() {
  return <DriverGate />;
}
