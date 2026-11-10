import type { Metadata } from "next";
import { PrivacyArticle } from "@/components/legal-article";

export const metadata: Metadata = { title: "الخصوصية · وجبتي" };

export default function PrivacyPage() {
  return <PrivacyArticle />;
}
