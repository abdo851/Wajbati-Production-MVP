import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { dataProvider } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET() {
  return handle(async () => {
    try {
      const current = await getCurrentUser();
      return NextResponse.json({
        user: current?.user ?? null,
        provider: dataProvider(),
      });
    } catch (error) {
      console.error("SESSION", error instanceof Error ? error.message : "unknown");
      throw error;
    }
  });
}
