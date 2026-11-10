import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser, issueSession } from "@/lib/auth/current-user";
import { GOOGLE_PENDING_COOKIE, readGooglePending } from "@/lib/auth/google";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { dataProvider, finishSupabaseStaff, getRepository, registerChef } from "@/lib/db";
import { sniffImage } from "@/lib/documents";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { parseChefApplication, parseChefCompliance, parseSignature } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const input = {
      ...parseChefApplication({
        fullName: form.get("fullName"),
        kitchenName: form.get("kitchenName"),
        city: form.get("city"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
        passwordConfirm: form.get("passwordConfirm"),
      }),
    };
    const compliance = parseChefCompliance(form);
    input.autoEntrepreneurNumber = compliance.autoEntrepreneurNumber;
    input.signature = parseSignature(form.get("signature"));
    const bytes = Buffer.from(await compliance.cinFront.arrayBuffer());
    const contentType = sniffImage(bytes);
    if (!contentType) throw new StoreError("Upload a JPG, PNG, or WEBP photo under 4 MB.", 400);

    const pending = await readGooglePending();
    const googleSub = pending && pending.desk === "chef" && pending.email === input.email ? pending.sub : null;
    const current = await getCurrentUser();
    const jar = await cookies();

    if (dataProvider() === "supabase" && current?.accessToken && current.user.role === "customer" && googleSub) {
      const user = await finishSupabaseStaff(current.accessToken, "chef", {
        fullName: input.fullName,
        phone: input.phone,
        city: input.city,
        vehicle: "",
        kitchenName: input.kitchenName,
      });
      if (!user?.chefId) throw new StoreError("Could not open the kitchen.", 500);
      await getRepository(current.accessToken).saveChefDocument(user.chefId, "cin_front", contentType, bytes);
      jar.delete(GOOGLE_PENDING_COOKIE);
      return NextResponse.json({ user, pendingReview: true });
    }

    const created = await registerChef(input, googleSub);
    if (!created?.user?.chefId) throw new StoreError("Could not open the kitchen.", 500);
    await getRepository(created.accessToken).saveChefDocument(created.user.chefId, "cin_front", contentType, bytes);
    const devUrl = created.confirmationToken
      ? new URL(`/confirm-email?token=${created.confirmationToken}`, request.url).toString()
      : "";
    if (process.env.NODE_ENV !== "production" && devUrl) {
      console.log(`[DEV] Confirm URL: ${devUrl}`);
    }
    if (created.accessToken) {
      jar.set(SESSION_COOKIE, issueSession(created.user.id, created.accessToken), sessionCookieOptions());
    }
    if (googleSub) jar.delete(GOOGLE_PENDING_COOKIE);
    return NextResponse.json({
      user: created.user,
      pendingReview: true,
      email_confirmed: created.user.emailConfirmed,
      dev_confirmation_url: process.env.NODE_ENV !== "production" && devUrl ? devUrl : undefined,
    });
  });
}
