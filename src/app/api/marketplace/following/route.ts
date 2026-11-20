import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in as a customer to view followed listings.", 401);
    }
    const listings = await marketplaceStore.listFollowedPublicListings(current.user.id);
    return NextResponse.json({ listings });
  });
}
