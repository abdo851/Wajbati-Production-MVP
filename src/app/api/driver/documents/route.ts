import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { SHARP_PHOTO_ERROR, sharpPhotoSize, sniffImage } from "@/lib/documents";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseDocumentKind } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("driver");
    if (!current.user.driverId) throw new StoreError("This driver profile is incomplete.", 403);
    const form = await request.formData();
    const kind = parseDocumentKind(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File) || !sharpPhotoSize(file.size)) throw new StoreError(SHARP_PHOTO_ERROR, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!sharpPhotoSize(bytes.length)) throw new StoreError(SHARP_PHOTO_ERROR, 400);
    const contentType = sniffImage(bytes);
    if (!contentType) throw new StoreError(SHARP_PHOTO_ERROR, 400);
    await getRepository(current.accessToken).saveDriverDocument(current.user.driverId, kind, contentType, bytes);
    return NextResponse.json({ ok: true });
  });
}
