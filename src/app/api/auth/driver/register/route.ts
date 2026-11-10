import { NextResponse } from "next/server";
import { getRepository, registerDriver } from "@/lib/db";
import { requiredDocumentKinds, SHARP_PHOTO_ERROR, sharpPhotoSize, sniffImage } from "@/lib/documents";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseDriverApplication, parseSignature } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const input = parseDriverApplication({
      fullName: form.get("fullName"),
      email: form.get("email"),
      phone: form.get("phone"),
      password: form.get("password"),
      passwordConfirm: form.get("passwordConfirm"),
      city: form.get("city"),
      vehicle: form.get("vehicle"),
    });
    input.signature = parseSignature(form.get("signature"));
    const created = await registerDriver(input);
    if (!created.user?.driverId) throw new StoreError("Could not open the driver route.", 500);
    for (const kind of requiredDocumentKinds(input.vehicle)) {
      const file = form.get(kind);
      if (!(file instanceof File) || !sharpPhotoSize(file.size)) {
        throw new StoreError(SHARP_PHOTO_ERROR, 400);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const contentType = sniffImage(bytes);
      if (!contentType || !sharpPhotoSize(bytes.length)) throw new StoreError(SHARP_PHOTO_ERROR, 400);
      await getRepository(created.accessToken).saveDriverDocument(created.user.driverId, kind, contentType, bytes);
    }
    const devUrl = created.confirmationToken
      ? new URL(`/confirm-email?token=${created.confirmationToken}`, request.url).toString()
      : "";
    if (process.env.NODE_ENV !== "production" && devUrl) {
      console.log(`[DEV] Confirm URL: ${devUrl}`);
    }
    return NextResponse.json({
      user: created.user,
      email_confirmed: false,
      dev_confirmation_url: process.env.NODE_ENV !== "production" && devUrl ? devUrl : undefined,
    });
  });
}
