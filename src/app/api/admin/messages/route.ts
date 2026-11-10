import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseChatMessage, readBody } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    const current = await requireDesk("admin");
    const threads = await getRepository(current.accessToken).listMessageThreads();
    return NextResponse.json({ threads });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const input = parseChatMessage(await readBody(request));
    if (!input.threadId) throw new StoreError("That conversation could not be found.", 404);
    const existing = await getRepository(current.accessToken).listMessages(input.threadId);
    if (!existing) throw new StoreError("That conversation could not be found.", 404);
    const thread = await getRepository(current.accessToken).sendMessage({
      threadId: input.threadId,
      participantRole: existing.participantRole,
      participantName: existing.participantName,
      sender: "admin",
      body: input.body,
    });
    return NextResponse.json({ thread });
  });
}
