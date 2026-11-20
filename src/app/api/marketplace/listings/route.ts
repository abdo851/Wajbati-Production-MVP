import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import type { ListingAvailability, ListingKind, ListingPriceMode } from "@/lib/marketplace/types";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function GET(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-listings-get:${clientKey(request)}`, 60, 60_000, "local"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "1";
    if (mine) {
      const current = await requireDesk("chef");
      const chefId = current.user.chefId!;
      const listings = await marketplaceStore.listForChef(chefId, true);
      return NextResponse.json({ listings });
    }
    const result = await marketplaceStore.listPublic({
      q: url.searchParams.get("q") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      sellerUserId: url.searchParams.get("sellerUserId") ?? undefined,
      chefProfileId: url.searchParams.get("chefProfileId") ?? undefined,
      kind: (url.searchParams.get("kind") as ListingKind | null) ?? undefined,
      availability: (url.searchParams.get("availability") as ListingAvailability | null) ?? undefined,
      priceMode: (url.searchParams.get("priceMode") as ListingPriceMode | null) ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number(url.searchParams.get("limit") || 24) || 24,
    });
    return NextResponse.json(result);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-listings-post:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("chef");
    if (current.user.chefApprovalStatus !== "approved") {
      throw new StoreError("Your kitchen must be approved before publishing listings.", 403);
    }
    const chefId = current.user.chefId!;
    const body = (await readBody(request)) as Record<string, unknown>;
    const listing = await marketplaceStore.createListing({
      chefProfileId: chefId,
      sellerUserId: current.user.id,
      body: {
        ...body,
        city: typeof body.city === "string" && body.city.trim() ? body.city : current.user.city ?? "",
      },
      // Approved sellers can publish visibly; admin can still hide/reject via moderation desk.
      autoApprove: true,
    });

    if (listing.isPublished && listing.moderationStatus === "approved") {
      try {
        const { prisma } = await import("@/lib/db/prisma");
        const follows = await prisma.follow.findMany({
          where: { chefId: current.user.id },
          select: { customerId: true },
          take: 200,
        });
        await marketplaceStore.notifyFollowersOfListing({
          followerUserIds: follows.map((row) => row.customerId),
          listing,
          kitchenName: current.user.kitchenName || "Kitchen",
        });
      } catch {
        // Follow fan-out is best-effort; never block listing create on graph read failure.
      }
    }

    return NextResponse.json({ listing }, { status: 201 });
  });
}
