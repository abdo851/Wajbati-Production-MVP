import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer" || !current.user.phone) {
      throw new StoreError("Sign in to see profile orders.", 401);
    }
    const orders = await getRepository(current.accessToken).listCustomerOrders(current.user.phone);
    return NextResponse.json({ orders });
  });
}
