import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function targetMeta() {
  const raw = process.env.CUSTOM_DATABASE_URL || "";
  try {
    const url = new URL(raw.replace(/^prisma\+/, ""));
    const host = url.hostname.toLowerCase();
    const ref =
      (decodeURIComponent(url.username || "").match(/^postgres\.([a-z0-9]+)$/) || [])[1] ||
      (host.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] ||
      null;
    const hostKind = host.includes("neon.tech")
      ? "neon"
      : host.includes("supabase")
        ? "supabase"
        : host === "127.0.0.1" || host === "localhost"
          ? "local"
          : "other";
    return {
      hostKind,
      refMatchesPrimary: ref === "npgoovxofxoheghlqlky",
      dataProvider: process.env.DATA_PROVIDER === "supabase" ? "supabase" : "local",
    };
  } catch {
    return { hostKind: "unknown", refMatchesPrimary: false, dataProvider: process.env.DATA_PROVIDER === "supabase" ? "supabase" : "local" };
  }
}

export async function GET() {
  const target = targetMeta();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected", target, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", db: "down", target, time: new Date().toISOString() }, { status: 503 });
  }
}
