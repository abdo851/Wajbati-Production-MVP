import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const notifications = await marketplaceStore.listNotifications(current.user.id);
    let suggestions: Awaited<ReturnType<typeof marketplaceStore.sellerSuggestions>> = [];
    if (current.user.role === "chef") {
      suggestions = await marketplaceStore.sellerSuggestions(current.user.id);
    }
    return NextResponse.json({ notifications, suggestions });
  });
}
