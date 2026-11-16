import { NextResponse } from "next/server";
import { findCustomerByEmail, getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email || !email.includes("@")) {
      throw new StoreError("Enter a valid email.", 400);
    }
    const customer = await findCustomerByEmail(email);
    if (!customer) {
      throw new StoreError("No account found for this email.", 404);
    }
    const board = await getRepository().listFollowingMeals(customer.id);
    return NextResponse.json({ ...board, customerName: customer.fullName });
  });
}
