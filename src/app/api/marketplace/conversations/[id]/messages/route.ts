import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { marketplaceStore } from "@/lib/db/marketplace-store";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || (current.user.role !== "customer" && current.user.role !== "chef")) {
      throw new StoreError("Sign in to continue.", 401);
    }
    const { id } = await params;
    const result = await marketplaceStore.getConversation(id, current.user.id);
    await marketplaceStore.markConversationRead(id, current.user.id);
    return NextResponse.json(result);
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`market-msg:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current || (current.user.role !== "customer" && current.user.role !== "chef")) {
      throw new StoreError("Sign in to continue.", 401);
    }
    const { id } = await params;
    const body = (await readBody(request)) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body : "";
    const result = await marketplaceStore.sendMessage({
      conversationId: id,
      senderUserId: current.user.id,
      body: text,
    });
    return NextResponse.json(result, { status: 201 });
  });
}
