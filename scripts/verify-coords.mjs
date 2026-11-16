import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const latest = await prisma.order.findFirst({
  where: { deliveryLat: { not: null } },
  orderBy: { createdAt: "desc" },
  select: { id: true, customerName: true, deliveryLat: true, deliveryLng: true, address: true, createdAt: true },
});
if (latest) {
  console.log("COORDS PERSISTED:", JSON.stringify(latest));
} else {
  console.log("No order with coordinates found yet.");
}
await prisma.$disconnect();
