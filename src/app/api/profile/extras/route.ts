import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { SERVICE_CITIES } from "@/lib/constants";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";

function optionalImage(value: FormDataEntryValue | null): string | null | undefined {
  if (value == null || value === "") return undefined;
  const image = String(value);
  if (!image.startsWith("data:image/")) throw new StoreError("Upload a photo.", 400);
  if (image.length > 500_000) throw new StoreError("That photo must stay under 500 KB.", 400);
  return image;
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await getCurrentUser();
    if (!current) throw new StoreError("Sign in to continue.", 401);
    const form = await request.formData();
    const city = String(form.get("city") ?? "").trim();
    if (city && !SERVICE_CITIES.includes(city as (typeof SERVICE_CITIES)[number])) {
      throw new StoreError("Choose a city we serve.", 400);
    }
    await getRepository(current.accessToken).saveProfileExtras(current.user.id, {
      avatarDataUrl: optionalImage(form.get("avatar")),
      kitchenPhotoDataUrl: optionalImage(form.get("kitchenPhoto")),
      vehiclePhotoDataUrl: optionalImage(form.get("vehiclePhoto")),
      licensePhotoDataUrl: optionalImage(form.get("licensePhoto")),
      bio: form.get("bio") == null ? undefined : String(form.get("bio")).slice(0, 280),
      city: city || undefined,
      notes: form.get("notes") == null ? undefined : String(form.get("notes")).slice(0, 400),
    });
    return NextResponse.json({ ok: true });
  });
}
