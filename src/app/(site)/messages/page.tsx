import type { Metadata } from "next";
import { MessagesDesk } from "@/components/messages-desk";

export const metadata: Metadata = {
  title: "الرسائل",
};

export default function MessagesPage() {
  return <MessagesDesk />;
}
