import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateCustomer } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseCustomerProfile, readBody } from "@/lib/validators";

export async function PATCH(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "customer") {
      throw new StoreError("Sign in to continue.", 401);
    }
    const input = parseCustomerProfile(await readBody(request));
    const user = await updateCustomer(current.user.id, input, current.accessToken);
    if (!user) throw new StoreError("Could not save the profile.", 400);
    return NextResponse.json({ user });
  });
}
