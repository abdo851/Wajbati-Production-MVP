import { Suspense } from "react";
import type { Metadata } from "next";
import { TrackPanel } from "@/components/track-panel";

export const metadata: Metadata = {
  title: "Tracking",
};

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6" />}>
      <Tracked params={params} />
    </Suspense>
  );
}

async function Tracked({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TrackPanel token={token} />;
}
