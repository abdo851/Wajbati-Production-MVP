import type { Metadata } from "next";
import { CompanyForm } from "@/components/company-form";

export const metadata: Metadata = { title: "شركة التوصيل" };

export default function CompanyPage() {
  return <CompanyForm />;
}
