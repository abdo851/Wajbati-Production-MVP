import type { Metadata } from "next";
import { Suspense } from "react";
import { ChefProfileLoader } from "@/components/chef-profile-loader";

export const metadata: Metadata = {
  title: "واجهة المتجر",
};

async function ChefProfileContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChefProfileLoader chefId={id} />;
}

export default function PublicChefPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6" />}>
      <ChefProfileContent params={params} />
    </Suspense>
  );
}
