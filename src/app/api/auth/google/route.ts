import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "google_not_configured" }, { status: 501 });
}
