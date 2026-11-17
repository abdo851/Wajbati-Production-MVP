import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const EMAIL = "abderrahimallali92@gmail.com";
const PASSWORD = "Allali@@@@321";

const prisma = new PrismaClient();
const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
if (!admin) {
  console.log("RESULT: NO ADMIN USER IN DATABASE");
  process.exit(1);
}
console.log("email:", admin.email, "| role:", admin.role, "| stored:", admin.password.slice(0, 18) + "...");

const [salt, hash] = admin.password.split(":");
const expected = scryptSync(PASSWORD, salt, 32);
const actual = Buffer.from(hash, "hex");
const match = actual.length === expected.length && timingSafeEqual(actual, expected);
console.log("hash matches Allali@@@@321:", match);

if (!match) {
  const newSalt = randomBytes(16).toString("hex");
  const newHash = scryptSync(PASSWORD, newSalt, 32).toString("hex");
  await prisma.user.update({ where: { id: admin.id }, data: { email: EMAIL, password: `${newSalt}:${newHash}` } });
  const check = await prisma.user.findUnique({ where: { id: admin.id } });
  const [s2, h2] = check.password.split(":");
  const verify = scryptSync(PASSWORD, s2, 32).toString("hex") === h2;
  console.log("UPDATED. readback hash matches:", verify, "| email:", check.email);
} else {
  console.log("No update needed.");
}
await prisma.$disconnect();
