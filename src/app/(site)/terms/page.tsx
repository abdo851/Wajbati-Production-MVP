import type { Metadata } from "next";
import { TermsArticle } from "@/components/legal-article";

export const metadata: Metadata = { title: "الشروط · وجبتي" };

export default function TermsPage() {
  return <TermsArticle />;
}
