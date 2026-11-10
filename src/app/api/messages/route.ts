import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseChatMessage, readBody } from "@/lib/validators";

function staff(role: string | undefined): "chef" | "driver" | null {
  if (role === "chef" || role === "driver") return role;
  return null;
}

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    const role = staff(current?.user.role);
    if (!current || !role) throw new StoreError("Sign in to continue.", 401);
    const thread = await getRepository(current.accessToken).listMessages(current.user.id);
    return NextResponse.json({ thread });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    const role = staff(current?.user.role);
    if (!current || !role) throw new StoreError("Sign in to continue.", 401);
    const input = parseChatMessage(await readBody(request));
    const thread = await getRepository(current.accessToken).sendMessage({
      threadId: current.user.id,
      participantRole: role,
      participantName: current.user.fullName,
      sender: "user",
      body: input.body,
    });
    return NextResponse.json({ thread });
  });
}
