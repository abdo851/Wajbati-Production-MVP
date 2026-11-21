import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`acct-case-msg:${clientKey(request)}`, 20, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const { id } = await context.params;
    const access = await adminMarketplaceStore.assertParticipantAccess(id, current.user.id);
    const body = (await readBody(request)) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body : "";
    const message = await adminMarketplaceStore.addCaseMessage({
      reportId: id,
      senderUserId: current.user.id,
      senderRole: access.role,
      recipient: "admin",
      body: text,
    });
    return NextResponse.json({ message }, { status: 201 });
  });
}
