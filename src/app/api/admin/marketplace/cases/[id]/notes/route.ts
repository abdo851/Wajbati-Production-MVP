import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { adminMarketplaceStore } from "@/lib/db/admin-marketplace";
import { StoreError } from "@/lib/errors";
import { checkRateLimitAsync, clientKey } from "@/lib/rate-limit";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await checkRateLimitAsync(`admin-mkt-note:${clientKey(request)}`, 30, 60_000, "closed"))) {
      throw new StoreError("Too many requests. Try again shortly.", 429);
    }
    const current = await requireDesk("admin");
    const { id } = await context.params;
    const body = (await readBody(request)) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body : "";
    const note = await adminMarketplaceStore.addNote({
      reportId: id,
      authorAdminId: current.user.id,
      actorEmail: current.user.email,
      body: text,
    });
    return NextResponse.json({ note }, { status: 201 });
  });
}
