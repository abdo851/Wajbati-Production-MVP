import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db";
import { SHARP_PHOTO_ERROR, sharpPhotoSize, sniffImage } from "@/lib/documents";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseCreateMeal, parseMealEdit, parseMealId, parseMealVisibility, readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const { user, accessToken } = await requireDesk("chef");
    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("multipart/form-data")) {
      const input = parseCreateMeal(await readBody(request));
      const meal = await getRepository(accessToken).createMeal(user.chefId as string, input);
      return NextResponse.json({ meal }, { status: 201 });
    }
    const form = await request.formData();
    const price = Number(form.get("priceMad"));
    const quantity = Number(form.get("maxQuantity"));
    const input = parseCreateMeal({
      title: form.get("title"),
      description: form.get("description"),
      priceMad: price,
      maxQuantity: Number.isInteger(quantity) ? quantity : Math.round(quantity),
    });
    const file = form.get("photo");
    if (!(file instanceof File) || !sharpPhotoSize(file.size)) {
      throw new StoreError(SHARP_PHOTO_ERROR, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = sniffImage(bytes);
    if (!contentType) throw new StoreError(SHARP_PHOTO_ERROR, 400);
    const repository = getRepository(accessToken);
    const meal = await repository.createMeal(user.chefId as string, input);
    await repository.saveMealPhoto(meal.id, contentType, bytes);
    return NextResponse.json({ meal: { ...meal, photoUrl: `/api/meals/${meal.id}/photo` } }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const { user, accessToken } = await requireDesk("chef");
    const body = await readBody(request);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const repository = getRepository(accessToken);
    if (typeof record.title === "string") {
      const input = parseMealEdit(record);
      const meal = await repository.updateMeal(user.chefId as string, input.mealId, input);
      return NextResponse.json({ meal });
    }
    const input = parseMealVisibility(record);
    const meal = await repository.setMealPublished(user.chefId as string, input.mealId, input.isPublished);
    return NextResponse.json({ meal });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const { user, accessToken } = await requireDesk("chef");
    const mealId = parseMealId(await readBody(request));
    await getRepository(accessToken).deleteMeal(user.chefId as string, mealId);
    return NextResponse.json({ ok: true });
  });
}
