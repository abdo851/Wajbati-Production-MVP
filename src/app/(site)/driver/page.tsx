import type { Metadata } from "next";
import { DriverGate } from "@/components/driver-gate";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  title: "توصيل",
};

export default function DriverPage() {
  return (
    <>
      <BackButton />
      <DriverGate />
    </>
  );
}
