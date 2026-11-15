import type { Metadata } from "next";
import { Suspense } from "react";
import { ChefProfileLoader } from "@/components/chef-profile-loader";

export const metadata: Metadata = {
  title: "مطبخ الطاهي",
};

export const instant = false;

export default async function PublicChefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6" />}>
      <ChefProfileLoader chefId={id} />
    </Suspense>
  );
}
