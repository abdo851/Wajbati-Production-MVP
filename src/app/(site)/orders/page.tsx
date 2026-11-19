import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { CustomerOrders } from "@/components/customer-orders";

export const metadata: Metadata = {
  title: "طلباتي",
};

export default function OrdersPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-8 sm:px-6 md:pb-10">
      <BackButton />
      <CustomerOrders />
    </main>
  );
}
