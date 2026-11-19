/**
 * Read-only admin row probe. Never prints password material.
 * Optional: VERIFY_ADMIN_PASSWORD to check scrypt match (result boolean only).
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, timingSafeEqual } from "crypto";

const EMAIL =
  process.env.RIGH_ADMIN_EMAIL || "abderrahimallali92@gmail.com";
const password = process.env.VERIFY_ADMIN_PASSWORD || "";

const prisma = new PrismaClient();
try {
  const admin = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
  });
  if (!admin) {
    console.log(JSON.stringify({ found: false, email: EMAIL }));
    process.exit(1);
  }
  const shapeOk = /^[a-f0-9]+:[a-f0-9]+$/i.test(admin.password || "");
  let hashMatches = null;
  if (password && shapeOk) {
    const [salt, hash] = admin.password.split(":");
    const expected = scryptSync(password, salt, 32);
    const actual = Buffer.from(hash, "hex");
    hashMatches =
      actual.length === expected.length &&
      timingSafeEqual(actual, expected);
  }
  console.log(
    JSON.stringify({
      found: true,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      hashShapeOk: shapeOk,
      hashMatches,
    }),
  );
} finally {
  await prisma.$disconnect();
}
