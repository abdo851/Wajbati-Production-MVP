import { NextResponse } from "next/server";
import { readGooglePending } from "@/lib/auth/google";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    const pending = await readGooglePending();
    return NextResponse.json({
      pending: pending ? { email: pending.email, name: pending.name, desk: pending.desk } : null,
    });
  });
}
