import type { Metadata } from "next";
import { ChefGuideArticle } from "@/components/legal-article";

export const metadata: Metadata = { title: "المقاول الذاتي · وجبتي" };

export default function ChefGuidePage() {
  return <ChefGuideArticle />;
}
