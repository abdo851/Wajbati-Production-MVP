import type { Metadata } from "next";
import { JoinIntro } from "@/components/join-intro";

export const metadata: Metadata = {
  title: "انضم إلينا",
};

export default function JoinPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 md:pb-10">
      <JoinIntro />
    </main>
  );
}
