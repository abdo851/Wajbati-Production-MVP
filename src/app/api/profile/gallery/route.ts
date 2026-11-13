import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const body = (await readBody(request)) as { image?: unknown };
    const image = String(body.image ?? "");
    if (!image.startsWith("data:image/")) throw new StoreError("Upload a photo.", 400);
    if (image.length > 500_000) throw new StoreError("That photo must stay under 500 KB.", 400);
    const gallery = await getRepository(current.accessToken).addGalleryPhoto(current.user.id, image);
    return NextResponse.json({ gallery });
  });
}
