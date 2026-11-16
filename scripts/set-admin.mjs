import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const NEW_EMAIL = "abderrahimallali92@gmail.com";
const NEW_PASSWORD = "Allali@@@@321";

const prisma = new PrismaClient();
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(NEW_PASSWORD, salt, 32).toString("hex");

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, email: true } });
if (!admin) throw new Error("No ADMIN user");
await prisma.user.update({ where: { id: admin.id }, data: { email: NEW_EMAIL, password: `${salt}:${hash}` } });

const check = await prisma.user.findUnique({ where: { id: admin.id }, select: { email: true, password: true } });
const [s2, h2] = check.password.split(":");
const localVerify = scryptSync(NEW_PASSWORD, s2, 32).toString("hex") === h2;
console.log("readback:", check.email, "| hash matches password:", localVerify);
await prisma.$disconnect();
if (!localVerify) process.exit(1);
