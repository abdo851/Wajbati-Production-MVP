import { SERVICE_CITIES } from "@/lib/constants";
import { DOCUMENT_KINDS } from "@/lib/documents";
import { StoreError } from "@/lib/errors";
import type {
  ChefApplication,
  CreateMealInput,
  CustomerAccountInput,
  DocumentKind,
  DriverApplication,
  OrderStatus,
  PlaceOrderInput,
  Vehicle,
} from "@/lib/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES: OrderStatus[] = ["pending", "confirmed", "delivered", "cancelled"];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreError("The request body is missing.", 400);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== "string") {
    throw new StoreError(`${label} is required.`, 400);
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min || trimmed.length > max) {
    throw new StoreError(`${label} must be ${min}–${max} characters.`, 400);
  }
  return trimmed;
}

function wholeNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new StoreError(`${label} must be a whole number from ${min} to ${max}.`, 400);
  }
  return value;
}

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new StoreError("The request body must be JSON.", 400);
  }
}

export function parseOrderInput(value: unknown): PlaceOrderInput {
  const body = asRecord(value);
  const mealId = text(body.mealId, "Meal", 36, 36);
  if (!UUID.test(mealId)) {
    throw new StoreError("That meal could not be found.", 400);
  }
  const customerPhone = text(body.customerPhone, "Phone", 8, 20);
  const digits = customerPhone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new StoreError("Enter a valid phone number.", 400);
  }
  return {
    mealId,
    customerName: text(body.customerName, "Name", 2, 80),
    customerPhone,
    deliveryAddress: text(body.deliveryAddress, "Delivery address", 4, 180),
    customerNotes: optionalNotes(body.customerNotes),
    quantity: wholeNumber(body.quantity, "Quantity", 1, 20),
  };
}

export function parseOrderEmail(value: unknown): { orderId: string; email: string } {
  const body = asRecord(value);
  const orderId = text(body.orderId, "Order", 36, 36);
  if (!UUID.test(orderId)) throw new StoreError("That order could not be found.", 400);
  const email = text(body.email, "Email", 5, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StoreError("Enter a valid email.", 400);
  }
  return { orderId, email };
}

function optionalNotes(value: unknown): string {
  if (value == null || value === "") return "";
  return text(value, "Notes", 1, 280);
}

export function parseCreateMeal(value: unknown): CreateMealInput {
  const body = asRecord(value);
  if (typeof body.priceMad !== "number" || !Number.isFinite(body.priceMad)) {
    throw new StoreError("Price must be a number in MAD.", 400);
  }
  const priceMad = Math.round(body.priceMad * 100) / 100;
  if (priceMad < 1 || priceMad > 500) {
    throw new StoreError("Price must be between 1 and 500 MAD.", 400);
  }
  return {
    title: text(body.title, "Title", 3, 80),
    description: text(body.description, "Description", 10, 400),
    priceMad,
    maxQuantity: wholeNumber(body.maxQuantity, "Max quantity", 1, 200),
  };
}

export function parseMealEdit(value: unknown): { mealId: string } & CreateMealInput {
  const body = asRecord(value);
  const mealId = text(body.mealId, "Meal", 36, 36);
  if (!UUID.test(mealId)) throw new StoreError("That meal could not be found.", 400);
  return { mealId, ...parseCreateMeal(value) };
}

export function parseMealId(value: unknown): string {
  const body = asRecord(value);
  const mealId = text(body.mealId, "Meal", 36, 36);
  if (!UUID.test(mealId)) throw new StoreError("That meal could not be found.", 400);
  return mealId;
}

export function parseMealVisibility(value: unknown): { mealId: string; isPublished: boolean } {
  const body = asRecord(value);
  const mealId = text(body.mealId, "Meal", 36, 36);
  if (!UUID.test(mealId)) throw new StoreError("That meal could not be found.", 400);
  if (typeof body.isPublished !== "boolean") {
    throw new StoreError("Publish state is required.", 400);
  }
  return { mealId, isPublished: body.isPublished };
}

export function parseStatusUpdate(value: unknown): { orderId: string; status: OrderStatus } {
  const body = asRecord(value);
  const orderId = text(body.orderId, "Order", 36, 36);
  if (!UUID.test(orderId)) throw new StoreError("That order could not be found.", 400);
  if (typeof body.status !== "string" || !STATUSES.includes(body.status as OrderStatus)) {
    throw new StoreError("That status is not recognized.", 400);
  }
  return { orderId, status: body.status as OrderStatus };
}

function password(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  if (next.length < 8 || next.length > 80) {
    throw new StoreError("Password must be 8–80 characters.", 400);
  }
  return next;
}

export function parseDriverLogin(value: unknown): { identifier: string; password: string } {
  const body = asRecord(value);
  return { identifier: loginIdentifier(body.phone ?? body.identifier), password: password(body.password) };
}

export function parseDriverApplication(value: unknown): DriverApplication {
  const body = asRecord(value);
  const city = serviceCity(body.city);
  const secret = confirmedPassword(body.password, body.passwordConfirm);
  return {
    fullName: text(body.fullName, "Name", 2, 80),
    email: emailAddress(body.email),
    phone: phoneDigits(body.phone),
    password: secret,
    city,
    vehicle: vehicle(body.vehicle),
    signature: "",
  };
}

export function parseChefApplication(value: unknown): ChefApplication {
  const body = asRecord(value);
  return {
    fullName: text(body.fullName, "Name", 2, 80),
    kitchenName: text(body.kitchenName, "Kitchen", 2, 80),
    email: emailAddress(body.email),
    phone: phoneDigits(body.phone),
    password: confirmedPassword(body.password, body.passwordConfirm),
    city: serviceCity(body.city),
    foodSafetyAccepted: true,
    autoEntrepreneurNumber: null,
    signature: "",
  };
}

export function parseSignature(value: unknown): string {
  const signature = String(value ?? "");
  if (!signature.startsWith("data:image/png;base64,")) {
    throw new StoreError("Add your electronic signature.", 400);
  }
  if (signature.length > 500_000) {
    throw new StoreError("The signature must stay under 500 KB.", 400);
  }
  return signature;
}

export function parseChefCompliance(value: FormData): {
  foodSafetyAccepted: true;
  cinFront: File;
  autoEntrepreneurNumber: string | null;
} {
  const accepted = value.get("foodSafetyAccepted");
  if (accepted !== "true" && accepted !== "on") {
    throw new StoreError("Accept the food safety commitment to open a kitchen.", 400);
  }
  const file = value.get("cinFront");
  if (!(file instanceof File)) throw new StoreError("Upload the front of your CIN.", 400);
  if (file.size < 32 || file.size > 4_000_000) {
    throw new StoreError("Upload a JPG, PNG, or WEBP photo under 4 MB.", 400);
  }
  if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new StoreError("Upload a JPG, PNG, or WEBP photo under 4 MB.", 400);
  }
  const raw = String(value.get("autoEntrepreneurNumber") ?? "").trim();
  if (raw && !/^\d{10,15}$/.test(raw)) {
    throw new StoreError("The auto-entrepreneur number must be 10 to 15 digits.", 400);
  }
  return { foodSafetyAccepted: true, cinFront: file, autoEntrepreneurNumber: raw || null };
}

export function parseChefReview(value: unknown): { chefId: string; status: "approved" | "rejected" | "postponed" } {
  const body = asRecord(value);
  const chefId = text(body.chefId, "Kitchen", 36, 36);
  if (!UUID.test(chefId)) throw new StoreError("That kitchen could not be found.", 400);
  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "postponed") {
    throw new StoreError("Choose approve or reject.", 400);
  }
  return { chefId, status: body.status };
}

export function parseCustomerAccount(value: unknown): CustomerAccountInput {
  const body = asRecord(value);
  return {
    fullName: text(body.fullName, "Name", 2, 80),
    email: optionalEmail(body.email),
    phone: phoneDigits(body.phone),
    password: confirmedPassword(body.password, body.passwordConfirm),
  };
}

export function parseCustomerLogin(value: unknown): { identifier: string; password: string } {
  const body = asRecord(value);
  return { identifier: loginIdentifier(body.identifier ?? body.phone ?? body.email), password: password(body.password) };
}

export function parseCustomerProfile(value: unknown): { fullName: string; phone: string } {
  const body = asRecord(value);
  return {
    fullName: text(body.fullName, "Name", 2, 80),
    phone: phoneDigits(body.phone),
  };
}

export function parseDocumentKind(value: unknown): DocumentKind {
  if (typeof value !== "string" || !DOCUMENT_KINDS.includes(value as DocumentKind)) {
    throw new StoreError("That document type is not recognized.", 400);
  }
  return value as DocumentKind;
}

export function parseOrderId(value: unknown): { orderId: string } {
  const body = asRecord(value);
  const orderId = text(body.orderId, "Order", 36, 36);
  if (!UUID.test(orderId)) throw new StoreError("That order could not be found.", 400);
  return { orderId };
}

export function parseOrderAction(value: unknown): { orderId: string; action: "pick_up" | "deliver" | "release"; code: string } {
  const { orderId } = parseOrderId(value);
  const body = asRecord(value);
  if (body.action !== "pick_up" && body.action !== "deliver" && body.action !== "release") {
    throw new StoreError("That status is not recognized.", 400);
  }
  const code = body.action === "deliver" ? deliveryCode(body.code) : "";
  return { orderId, action: body.action, code };
}

function deliveryCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}$/.test(code)) throw new StoreError("Enter the 4-digit code from the customer.", 400);
  return code;
}

export function parseDriverReview(value: unknown): { driverId: string; status: "approved" | "rejected" | "postponed" } {
  const body = asRecord(value);
  const driverId = text(body.driverId, "Driver", 36, 36);
  if (!UUID.test(driverId)) throw new StoreError("That driver could not be found.", 400);
  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "postponed") {
    throw new StoreError("Choose approve or reject.", 400);
  }
  return { driverId, status: body.status };
}

function phoneDigits(value: unknown): string {
  const raw = text(value, "Phone", 8, 20);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new StoreError("Enter a valid phone number.", 400);
  }
  return digits;
}

function emailAddress(value: unknown): string {
  const email = text(value, "Email", 5, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StoreError("Enter a valid email.", 400);
  }
  return email;
}

function optionalEmail(value: unknown): string {
  if (value == null || value === "") return "";
  return emailAddress(value);
}

function confirmedPassword(value: unknown, confirm: unknown): string {
  const secret = password(value);
  if (typeof confirm !== "string" || confirm !== value) {
    throw new StoreError("Password confirmation does not match.", 400);
  }
  return secret;
}

function loginIdentifier(value: unknown): string {
  const raw = text(value, "Phone or email", 5, 120).toLowerCase();
  if (raw.includes("@")) return emailAddress(raw);
  return phoneDigits(raw);
}

function serviceCity(value: unknown): string {
  const city = text(value, "City", 2, 40);
  if (!SERVICE_CITIES.includes(city as (typeof SERVICE_CITIES)[number])) {
    throw new StoreError("Choose Casablanca, Rabat, or Marrakech.", 400);
  }
  return city;
}

function vehicle(value: unknown): Vehicle {
  if (value !== "bike" && value !== "motorbike" && value !== "car") {
    throw new StoreError("Choose a bicycle, a motorbike, or a car.", 400);
  }
  return value;
}

export function parseLogin(value: unknown): { email: string; password: string; desk: "chef" | "admin" } {
  const body = asRecord(value);
  const email = text(body.email, "Email", 5, 120).toLowerCase();
  if (!email.includes("@")) throw new StoreError("Enter a valid email.", 400);
  const secret = password(body.password);
  if (body.desk !== "chef" && body.desk !== "admin") {
    throw new StoreError("Choose the chef kitchen or the admin desk.", 400);
  }
  return { email, password: secret, desk: body.desk };
}

export function parseDirectMessage(value: unknown): { body: string; mealId: string | null; orderId: string | null; threadId: string | null } {
  const record = asRecord(value);
  const body = text(record.body, "Message", 1, 1000);
  const mealId = record.mealId == null || record.mealId === "" ? null : text(record.mealId, "Meal", 8, 80);
  const orderId = record.orderId == null || record.orderId === "" ? null : text(record.orderId, "Order", 8, 80);
  const threadId = record.threadId == null || record.threadId === "" ? null : text(record.threadId, "Thread", 8, 160);
  if (!mealId && !orderId && !threadId) throw new StoreError("That conversation could not be found.", 404);
  return { body, mealId, orderId, threadId };
}

export function parseCommissionSettings(value: unknown): { chefCommissionMad: number; driverCommissionMad: number } {
  const record = asRecord(value);
  return {
    chefCommissionMad: commissionAmount(record.chefCommissionMad),
    driverCommissionMad: commissionAmount(record.driverCommissionMad),
  };
}

function commissionAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new StoreError("Price must be a number in MAD.", 400);
  }
  return Math.round(value * 100) / 100;
}

export function parseChatMessage(value: unknown): { body: string; threadId: string | null } {
  const record = asRecord(value);
  const threadId = record.threadId == null || record.threadId === "" ? null : text(record.threadId, "Thread", 8, 80);
  return { body: text(record.body, "Message", 1, 1000), threadId };
}

export function parseWalletAdjust(value: unknown): { ownerId: string; amountMad: number } {
  const record = asRecord(value);
  const ownerId = text(record.ownerId, "Account", 8, 80);
  const amount = record.amountMad;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) {
    throw new StoreError("Price must be a number in MAD.", 400);
  }
  return { ownerId, amountMad: Math.round(amount * 100) / 100 };
}

