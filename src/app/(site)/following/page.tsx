import type { Metadata } from "next";
import { FollowingFeed } from "@/components/following-feed";

export const metadata: Metadata = {
  title: "متابعاتي",
};

export default function FollowingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 md:pb-10">
      <h1 className="font-display text-4xl">متابعاتي</h1>
      <FollowingFeed />
    </main>
  );
}
