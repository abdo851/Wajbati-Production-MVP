import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { handle } from "@/lib/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    const index = Number(new URL(request.url).searchParams.get("i") ?? "0");
    const file = await getRepository().readMealPhoto(id, Number.isInteger(index) && index >= 0 ? index : 0);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
