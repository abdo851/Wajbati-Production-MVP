import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { messageSharesContact } from "@/lib/contact-guard";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseDirectMessage, readBody } from "@/lib/validators";
import type { AuthUser, ChatActor } from "@/lib/types";

function actorFrom(user: AuthUser): ChatActor {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    chefId: user.chefId,
    driverId: user.driverId,
    phone: user.phone,
  };
}

function requireChatUser(user: AuthUser | undefined): AuthUser {
  if (!user || (user.role !== "customer" && user.role !== "chef" && user.role !== "driver")) {
    throw new StoreError("Sign in to continue.", 401);
  }
  return user;
}

export async function GET(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    const user = requireChatUser(current?.user);
    const url = new URL(request.url);
    const query = {
      mealId: url.searchParams.get("mealId"),
      orderId: url.searchParams.get("orderId"),
      threadId: url.searchParams.get("threadId"),
    };
    const repository = getRepository(current?.accessToken);
    if (query.mealId || query.orderId || query.threadId) {
      const thread = await repository.openDirectThread(actorFrom(user), query);
      return NextResponse.json({ thread });
    }
    const threads = await repository.listDirectThreads(actorFrom(user));
    return NextResponse.json({ threads });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    const user = requireChatUser(current?.user);
    const input = parseDirectMessage(await readBody(request));
    if (messageSharesContact(input.body)) {
      throw new StoreError("Phone numbers, emails, and links are not allowed in chat.", 400);
    }
    const thread = await getRepository(current?.accessToken).sendDirectMessage(actorFrom(user), input);
    return NextResponse.json({ thread });
  });
}
