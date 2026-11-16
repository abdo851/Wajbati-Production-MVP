import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/auth/current-user";
import { authenticate, updateAdminCredentials } from "@/lib/db";
import { StoreError } from "@/lib/errors";
import { handle } from "@/lib/server/http";
import { readBody } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireDesk("admin");
    const body = (await readBody(request)) as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (currentPassword.length < 8) throw new StoreError("Enter your current password.", 400);
    const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newEmail && (!newEmail.includes("@") || newEmail.length > 120)) {
      throw new StoreError("Enter a valid email.", 400);
    }
    if (newPassword && (newPassword.length < 8 || newPassword.length > 80)) {
      throw new StoreError("Password must be 8-80 characters.", 400);
    }
    if (!newEmail && !newPassword) throw new StoreError("Nothing to update.", 400);
    const verified = await authenticate(current.user.email, currentPassword);
    if (!verified) throw new StoreError("Current password is incorrect.", 403);
    await updateAdminCredentials(current.user.id, {
      email: newEmail || undefined,
      password: newPassword || undefined,
    });
    return NextResponse.json({ ok: true });
  });
}
