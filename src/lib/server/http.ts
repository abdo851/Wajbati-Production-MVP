import { cookies } from "next/headers";
import { connection } from "next/server";
import { NextResponse } from "next/server";
import { localizeKnownError } from "@/lib/error-text";
import { StoreError } from "@/lib/errors";
import type { Lang } from "@/lib/i18n";

async function requestLang(): Promise<Lang> {
  const jar = await cookies();
  const value = jar.get("wajbati_lang")?.value;
  if (value === "en" || value === "fr" || value === "ar") return value;
  return "ar";
}

export async function errorResponse(error: unknown) {
  const lang = await requestLang();
  if (error instanceof StoreError) {
    return NextResponse.json({ error: localizeKnownError(lang, error.message) }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: localizeKnownError(lang, "Something went wrong. Try again.") }, { status: 500 });
}

export async function handle(action: () => Promise<Response>) {
  await connection();
  try {
    return await action();
  } catch (error) {
    return await errorResponse(error);
  }
}
