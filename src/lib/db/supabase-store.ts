import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_FEE_MAD, DRIVER_COMMISSION_MAD, PLATFORM_COMMISSION_MAD } from "@/lib/constants";
import { documentsAreReady, extensionFor, requiredDocumentKinds } from "@/lib/documents";
import { financeOf, rowsOnDate, rowsThisWeek } from "@/lib/finance";
import { StoreError } from "@/lib/errors";
import { roundMoney, todayInCasablanca } from "@/lib/format";
import { assertTransition } from "@/lib/orders";
import type {
  ActiveDelivery,
  AdminOverview,
  AuthUser,
  ChatThread,
  CommissionSettings,
  DirectThread,
  Chef,
  ChefApprovalStatus,
  ChefBoard,
  ChefDocumentKind,
  ChefMeal,
  ChefOrder,
  CreateMealInput,
  DeliveryJob,
  ChefApplication,
  CustomerAccountInput,
  CustomerOrder,
  DocumentKind,
  DriverAccountStatus,
  DriverApplication,
  DriverBoard,
  DriverDocumentMeta,
  DriverRecord,
  KitchenStat,
  MealListResponse,
  MoneySnapshot,
  OrderReceipt,
  OrderStatus,
  OrderTracking,
  PaymentStatus,
  PlaceOrderInput,
  PublicMeal,
  RecentOrder,
  StaffAccount,
  Vehicle,
  WalletView,
} from "@/lib/types";

type ChefEmbed = { kitchen_name: string; city: string; is_active?: boolean };
type MealEmbed = { title: string };

function client(accessToken?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}

function fail(error: { message: string } | null, fallback: string): never {
  const message = error?.message ?? fallback;
  if (message.toLowerCase().includes("not enough portions")) {
    throw new StoreError("Not enough portions left.", 409);
  }
  if (message.toLowerCase().includes("just taken")) {
    throw new StoreError("That delivery was just taken.", 409);
  }
  if (message.toLowerCase().includes("outside your zone")) {
    throw new StoreError("That delivery is outside your zone.", 409);
  }
  if (message.toLowerCase().includes("waiting for approval")) {
    throw new StoreError("Your application is still waiting for approval.", 403);
  }
  if (message.toLowerCase().includes("already registered")) {
    throw new StoreError("That phone is already registered.", 409);
  }
  if (message.toLowerCase().includes("code does not match")) {
    throw new StoreError("That code does not match.", 409);
  }
  if (message.toLowerCase().includes("not allowed") || message.toLowerCase().includes("cannot take")) {
    throw new StoreError("That status change is not allowed.", 409);
  }
  throw new StoreError(message || fallback, 400);
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new StoreError("The database returned an unexpected number.", 500);
  return parsed;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toPublicMeal(row: Record<string, unknown>): PublicMeal {
  const chef = one(row.chefs as ChefEmbed | ChefEmbed[] | null);
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    priceMad: num(row.price_mad),
    maxQuantity: num(row.max_quantity),
    remainingQuantity: num(row.remaining_quantity),
    serviceDate: String(row.service_date),
    kitchenName: chef?.kitchen_name ?? "Kitchen",
    city: chef?.city ?? "",
    photoUrl: null,
  };
}

function toChefMeal(row: Record<string, unknown>): ChefMeal {
  return { ...toPublicMeal(row), isPublished: Boolean(row.is_published) };
}

function toChefOrder(row: Record<string, unknown>): ChefOrder {
  const meal = one(row.meals as MealEmbed | MealEmbed[] | null);
  const total = num(row.total_mad);
  const commission = num(row.commission_mad);
  return {
    id: String(row.id),
    mealTitle: meal?.title ?? "Meal",
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone),
    deliveryAddress: String(row.delivery_address),
    quantity: num(row.quantity),
    unitPriceMad: num(row.unit_price_mad),
    totalMad: total,
    commissionMad: commission,
    netMad: roundMoney(total - commission),
    customerNotes: String(row.customer_notes ?? ""),
    paymentMethod: row.payment_method === "wallet" ? "wallet" : "cash",
    paymentStatus: paymentStatus(row.payment_status),
    status: row.status as OrderStatus,
    createdAt: String(row.created_at),
  };
}

async function withKitchen(
  supabase: SupabaseClient,
  chefId: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("chefs").select("kitchen_name, city").eq("id", chefId).maybeSingle();
  return { ...row, chefs: data };
}

function toJob(row: Record<string, unknown>): DeliveryJob {
  const meal = one(row.meals as MealEmbed | MealEmbed[] | null);
  const chef = one(row.chefs as ChefEmbed | ChefEmbed[] | null);
  const fee = row.delivery_fee_mad == null ? DELIVERY_FEE_MAD : num(row.delivery_fee_mad);
  const commission = row.driver_commission_mad == null ? DRIVER_COMMISSION_MAD : num(row.driver_commission_mad);
  return {
    id: String(row.id),
    mealTitle: meal?.title ?? "Meal",
    kitchenName: chef?.kitchen_name ?? "Kitchen",
    city: chef?.city ?? "",
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone),
    deliveryAddress: String(row.delivery_address),
    quantity: num(row.quantity),
    status: row.status as OrderStatus,
    deliveryFeeMad: fee,
    driverCommissionMad: commission,
    driverNetMad: roundMoney(fee - commission),
    customerNotes: String(row.customer_notes ?? ""),
    paymentMethod: row.payment_method === "wallet" ? "wallet" : "cash",
    paymentStatus: paymentStatus(row.payment_status),
    createdAt: String(row.created_at),
  };
}

function paymentStatus(value: unknown): PaymentStatus {
  if (value === "unpaid" || value === "pending" || value === "paid" || value === "due_on_delivery") return value;
  return "due_on_delivery";
}

function asVehicle(value: unknown): Vehicle {
  if (value === "bike" || value === "motorbike" || value === "car") return value;
  return "motorbike";
}

function toDriverRecord(row: Record<string, unknown>, documents: DriverDocumentMeta[] = []): DriverRecord {
  const email = String(row.email ?? "");
  const vehicle = asVehicle(row.vehicle);
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email,
    phone: String(row.phone),
    city: String(row.city),
    vehicle,
    status: row.status as DriverAccountStatus,
    documents,
    documentsReady: documentsAreReady(vehicle, email, documents.map((item) => item.kind)),
    createdAt: String(row.created_at),
    ownerId: String(row.id),
    notes: String(row.notes ?? ""),
    is_active: row.is_active !== false,
    postponed: false,
    balanceMad: 0,
  };
}

const ORDER_JOB_SELECT =
  "id, customer_name, customer_phone, delivery_address, customer_notes, payment_method, payment_status, quantity, status, delivery_fee_mad, driver_commission_mad, driver_id, created_at, meals(title), chefs(kitchen_name, city)";

function toRecent(row: Record<string, unknown>): RecentOrder {
  const chef = one(row.chefs as ChefEmbed | ChefEmbed[] | null);
  return { ...toChefOrder(row), kitchenName: chef?.kitchen_name ?? "Kitchen" };
}

function moneyRow(row: Record<string, unknown>) {
  return {
    status: row.status as OrderStatus,
    quantity: num(row.quantity),
    totalMad: num(row.total_mad),
    commissionMad: num(row.commission_mad),
    deliveryFeeMad: num(row.delivery_fee_mad ?? DELIVERY_FEE_MAD),
    driverCommissionMad: num(row.driver_commission_mad ?? DRIVER_COMMISSION_MAD),
    createdAt: String(row.created_at),
  };
}

function snapshot(rows: Record<string, unknown>[]): MoneySnapshot {
  const active = rows.filter((row) => row.status !== "cancelled");
  const portions = active.reduce((sum, row) => sum + num(row.quantity), 0);
  const gross = active.reduce((sum, row) => sum + num(row.total_mad), 0);
  const commission = active.reduce((sum, row) => sum + num(row.commission_mad), 0);
  return {
    orders: active.length,
    portions,
    grossRevenueMad: roundMoney(gross),
    commissionMad: roundMoney(commission),
    chefPayoutMad: roundMoney(gross - commission),
  };
}

async function loadAuthUser(supabase: SupabaseClient, userId: string, email: string): Promise<AuthUser | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) fail(error, "Could not load the profile.");
  if (!profile) return null;
  if (profile.role === "driver") {
    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("id, full_name, phone, city, vehicle, status")
      .eq("profile_id", userId)
      .maybeSingle();
    if (driverError) fail(driverError, "Could not load the driver profile.");
    if (!driver) return null;
    return {
      id: userId,
      email,
      fullName: String(driver.full_name),
      role: "driver",
      chefId: null,
      kitchenName: null,
      driverId: String(driver.id),
      driverStatus: driver.status as DriverAccountStatus,
      city: String(driver.city),
      phone: String(driver.phone),
      vehicle: asVehicle(driver.vehicle),
      documentsReady: await driverDocumentsReady(supabase, String(driver.id), asVehicle(driver.vehicle), email),
      chefApprovalStatus: null,
      approvalStatus: null,
      emailConfirmed: true,
    };
  }
  if (profile.role === "customer") {
    return {
      id: userId,
      email,
      fullName: String(profile.full_name),
      role: "customer",
      chefId: null,
      kitchenName: null,
      driverId: null,
      driverStatus: null,
      city: null,
      phone: profile.phone ? String(profile.phone) : null,
      vehicle: null,
      documentsReady: null,
      chefApprovalStatus: null,
      approvalStatus: null,
      emailConfirmed: true,
    };
  }
  if (profile.role !== "chef" && profile.role !== "admin") return null;
  const chef = await loadChefRow(supabase, userId);
  return {
    id: userId,
    email,
    fullName: String(profile.full_name),
    role: profile.role,
    chefId: chef?.id ?? null,
    kitchenName: chef?.kitchenName ?? null,
    driverId: null,
    driverStatus: null,
    city: null,
    phone: profile.phone ? String(profile.phone) : null,
    vehicle: null,
    documentsReady: null,
    chefApprovalStatus: chef?.approvalStatus ?? null,
    approvalStatus: chef?.approvalStatus ?? null,
    emailConfirmed: true,
  };
}

async function loadChefRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; kitchenName: string; approvalStatus: ChefApprovalStatus } | null> {
  const withStatus = await supabase
    .from("chefs")
    .select("id, kitchen_name, approval_status")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!withStatus.error && withStatus.data) {
    const status = withStatus.data.approval_status;
    return {
      id: String(withStatus.data.id),
      kitchenName: String(withStatus.data.kitchen_name),
      approvalStatus: status === "pending" || status === "rejected" ? status : "approved",
    };
  }
  const basic = await supabase
    .from("chefs")
    .select("id, kitchen_name")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (basic.error || !basic.data) return null;
  return { id: String(basic.data.id), kitchenName: String(basic.data.kitchen_name), approvalStatus: "approved" };
}

async function loadChefById(supabase: SupabaseClient, chefId: string): Promise<ChefApprovalStatus> {
  const query = await supabase.from("chefs").select("approval_status").eq("id", chefId).maybeSingle();
  if (query.error || !query.data) return "approved";
  const status = query.data.approval_status;
  if (status === "pending" || status === "rejected" || status === "approved") return status;
  return "approved";
}

async function driverDocumentsReady(
  supabase: SupabaseClient,
  driverId: string,
  vehicle: Vehicle,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase.from("driver_documents").select("kind").eq("driver_id", driverId);
  if (error) return true;
  return documentsAreReady(
    vehicle,
    email,
    ((data ?? []) as Array<{ kind: DocumentKind }>).map((item) => item.kind),
  );
}

export async function signInSupabaseGoogle(idToken: string): Promise<{ user: AuthUser; accessToken: string } | null> {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error || !data.session || !data.user) return null;
  const user = await loadAuthUser(client(data.session.access_token), data.user.id, data.user.email ?? "");
  if (!user) return null;
  return { user, accessToken: data.session.access_token };
}

export async function authenticateSupabase(email: string, password: string): Promise<{
  user: AuthUser;
  accessToken: string;
} | null> {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) return null;
  const authed = client(data.session.access_token);
  const user = await loadAuthUser(authed, data.user.id, data.user.email ?? email);
  if (!user) return null;
  return { user, accessToken: data.session.access_token };
}

export async function findSupabaseUser(accessToken: string): Promise<AuthUser | null> {
  const supabase = client(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return loadAuthUser(supabase, data.user.id, data.user.email ?? "");
}

function driverEmail(phone: string): string {
  return `${phone}@drivers.wajbati.local`;
}

async function lookupAuthEmail(phone: string, fallback: string): Promise<string> {
  const { data, error } = await client().rpc("auth_email_for_phone", { p_phone: phone });
  if (!error && typeof data === "string" && data.includes("@")) return data;
  return fallback;
}

export async function authenticateSupabaseDriver(identifier: string, password: string) {
  const email = identifier.includes("@") ? identifier : await lookupAuthEmail(identifier, driverEmail(identifier));
  const result = await authenticateSupabase(email, password);
  if (!result || result.user.role !== "driver") return null;
  return result;
}

export async function registerSupabaseDriver(input: DriverApplication): Promise<void> {
  await signUpStaff({
    email: input.email,
    password: input.password,
    data: {
      role: "driver",
      full_name: input.fullName,
      phone: input.phone,
      city: input.city,
      vehicle: input.vehicle,
    },
  });
}

export async function registerSupabaseChef(input: ChefApplication): Promise<{ user: AuthUser; accessToken: string }> {
  const session = await signUpStaff({
    email: input.email,
    password: input.password,
    data: {
      role: "chef",
      full_name: input.fullName,
      phone: input.phone,
      city: input.city,
      kitchen_name: input.kitchenName,
    },
  });
  const user = await loadAuthUser(client(session.accessToken), session.userId, input.email);
  if (!user) throw new StoreError("Could not open the kitchen.", 500);
  if (user.chefId) {
    const updated = await client(session.accessToken)
      .from("chefs")
      .update({
        approval_status: "pending",
        auto_entrepreneur_number: input.autoEntrepreneurNumber,
        food_safety_accepted_at: new Date().toISOString(),
      })
      .eq("id", user.chefId);
    if (!updated.error) user.chefApprovalStatus = "pending";
  }
  return { user, accessToken: session.accessToken };
}

export async function registerSupabaseCustomer(input: CustomerAccountInput): Promise<{ user: AuthUser; accessToken: string }> {
  const email = input.email || `${input.phone}@customers.wajbati.local`;
  const session = await signUpStaff({
    email,
    password: input.password,
    data: { role: "customer", full_name: input.fullName, phone: input.phone },
  });
  const user = await loadAuthUser(client(session.accessToken), session.userId, email);
  if (!user) throw new StoreError("Could not open the profile.", 500);
  return { user, accessToken: session.accessToken };
}

export async function authenticateSupabaseCustomer(identifier: string, password: string) {
  const email = identifier.includes("@")
    ? identifier
    : await lookupAuthEmail(identifier, `${identifier}@customers.wajbati.local`);
  const result = await authenticateSupabase(email, password);
  if (!result || result.user.role !== "customer") return null;
  return result;
}

export async function updateSupabaseCustomer(accessToken: string, input: { fullName: string; phone: string }) {
  const supabase = client(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const updated = await supabase
    .from("profiles")
    .update({ full_name: input.fullName, phone: input.phone })
    .eq("id", data.user.id)
    .eq("role", "customer");
  if (updated.error) fail(updated.error, "Could not save the profile.");
  return loadAuthUser(supabase, data.user.id, data.user.email ?? "");
}

export async function completeSupabaseStaff(
  accessToken: string,
  role: "chef" | "driver",
  fields: { fullName: string; phone: string; city: string; vehicle: string; kitchenName: string },
) {
  const supabase = client(accessToken);
  const { error } = await supabase.rpc("complete_staff_signup", {
    p_role: role,
    p_full_name: fields.fullName,
    p_phone: fields.phone,
    p_city: fields.city,
    p_vehicle: fields.vehicle,
    p_kitchen: fields.kitchenName,
  });
  if (error) fail(error, "Could not save the account.");
  return findSupabaseUser(accessToken);
}

async function signUpStaff(input: { email: string; password: string; data: Record<string, string> }) {
  const supabase = client();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: input.data },
  });
  if (error) fail(error, "Could not save the account.");
  if (!data.session || !data.user) {
    throw new StoreError(
      "The account was saved, but sign-in needs email confirmations turned off in Supabase Auth.",
      400,
    );
  }
  return { accessToken: data.session.access_token, userId: data.user.id };
}

export function createSupabaseRepository(accessToken?: string) {
  const authed = client(accessToken);
  const anon = client();

  return {
    async listTodayMeals(): Promise<MealListResponse> {
      const serviceDate = todayInCasablanca();
      const { data, error } = await anon
        .from("meals")
        .select("id, title, description, price_mad, max_quantity, remaining_quantity, service_date, chefs!inner(kitchen_name, city)")
        .eq("is_published", true)
        .eq("service_date", serviceDate)
        .eq("chefs.is_active", true);
      if (error) fail(error, "Could not load today's meals.");
      const meals = ((data ?? []) as Record<string, unknown>[])
        .map(toPublicMeal)
        .sort((a, b) => Number(b.remainingQuantity > 0) - Number(a.remainingQuantity > 0));
      return { serviceDate, meals };
    },

    async placeOrder(input: PlaceOrderInput): Promise<OrderReceipt> {
      const { data, error } = await anon.rpc("place_order", {
        p_meal_id: input.mealId,
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone,
        p_delivery_address: input.deliveryAddress,
        p_quantity: input.quantity,
        p_customer_notes: input.customerNotes,
      });
      if (error) fail(error, "Could not place the order.");
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        mealTitle: String(row.mealTitle ?? row.meal_title ?? "Meal"),
        kitchenName: String(row.kitchenName ?? row.kitchen_name ?? "Kitchen"),
        customerName: String(row.customerName ?? row.customer_name ?? input.customerName),
        deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? input.deliveryAddress),
        quantity: num(row.quantity),
        unitPriceMad: num(row.unitPriceMad ?? row.unit_price_mad),
        totalMad: num(row.totalMad ?? row.total_mad),
        deliveryFeeMad: row.deliveryFeeMad == null && row.delivery_fee_mad == null
          ? DELIVERY_FEE_MAD
          : num(row.deliveryFeeMad ?? row.delivery_fee_mad),
        customerNotes: String(row.customerNotes ?? row.customer_notes ?? input.customerNotes),
        paymentMethod: row.paymentMethod === "wallet" || row.payment_method === "wallet" ? "wallet" : "cash",
        paymentStatus: paymentStatus(row.paymentStatus ?? row.payment_status),
        deliveryCode: String(row.deliveryCode ?? row.delivery_code ?? ""),
        trackToken: String(row.trackToken ?? row.track_token ?? ""),
        createdAt: String(row.createdAt ?? row.created_at),
      };
    },

    async chefBoard(chefId: string): Promise<ChefBoard> {
      const serviceDate = todayInCasablanca();
      const mealsQuery = await authed
        .from("meals")
        .select("id, title, description, price_mad, max_quantity, remaining_quantity, service_date, is_published, chefs(kitchen_name, city)")
        .eq("chef_id", chefId)
        .eq("service_date", serviceDate)
        .order("created_at", { ascending: false });
      if (mealsQuery.error) fail(mealsQuery.error, "Could not load your meals.");
      const ordersQuery = await authed
        .from("orders")
        .select("id, customer_name, customer_phone, delivery_address, customer_notes, payment_method, payment_status, quantity, unit_price_mad, total_mad, commission_mad, status, created_at, meals(title)")
        .eq("chef_id", chefId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (ordersQuery.error) fail(ordersQuery.error, "Could not load your orders.");
      const orders = ((ordersQuery.data ?? []) as Record<string, unknown>[])
        .map(toChefOrder)
        .filter(
          (order) =>
            order.status === "pending" ||
            order.status === "confirmed" ||
            order.status === "assigned" ||
            order.status === "picked_up" ||
            todayInCasablanca(new Date(order.createdAt)) === serviceDate,
        );
      const chef = await loadChefById(authed, chefId);
      return {
        serviceDate,
        meals: ((mealsQuery.data ?? []) as Record<string, unknown>[]).map(toChefMeal),
        orders,
        approvalStatus: chef,
      };
    },

    async createMeal(chefId: string, input: CreateMealInput): Promise<ChefMeal> {
      const approval = await loadChefById(authed, chefId);
      if (approval !== "approved") {
        throw new StoreError("Your account is under review. You cannot publish meals until approved.", 403);
      }
      const { data, error } = await authed
        .from("meals")
        .insert({
          chef_id: chefId,
          title: input.title,
          description: input.description,
          price_mad: input.priceMad,
          max_quantity: input.maxQuantity,
          remaining_quantity: input.maxQuantity,
          service_date: todayInCasablanca(),
          is_published: true,
        })
        .select("id, title, description, price_mad, max_quantity, remaining_quantity, service_date, is_published")
        .single();
      if (error) fail(error, "Could not publish the meal.");
      return toChefMeal(await withKitchen(authed, chefId, data as Record<string, unknown>));
    },

    async setMealPublished(chefId: string, mealId: string, isPublished: boolean): Promise<ChefMeal> {
      const { data, error } = await authed
        .from("meals")
        .update({ is_published: isPublished })
        .eq("id", mealId)
        .eq("chef_id", chefId)
        .select("id, title, description, price_mad, max_quantity, remaining_quantity, service_date, is_published")
        .maybeSingle();
      if (error) fail(error, "Could not update the meal.");
      if (!data) throw new StoreError("That meal could not be found.", 404);
      return toChefMeal(await withKitchen(authed, chefId, data as Record<string, unknown>));
    },

    async updateOrderStatus(chefId: string, orderId: string, status: OrderStatus): Promise<ChefOrder> {
      const existing = await authed
        .from("orders")
        .select("id, status, customer_name, customer_phone, delivery_address, customer_notes, payment_method, payment_status, quantity, unit_price_mad, total_mad, commission_mad, created_at, meals(title)")
        .eq("id", orderId)
        .eq("chef_id", chefId)
        .maybeSingle();
      if (existing.error) fail(existing.error, "Could not load the order.");
      if (!existing.data) throw new StoreError("That order could not be found.", 404);
      const current = existing.data.status as OrderStatus;
      assertTransition(current, status);
      if (current !== status) {
        const updated = await authed.from("orders").update({ status }).eq("id", orderId).eq("chef_id", chefId);
        if (updated.error) fail(updated.error, "Could not update the order.");
      }
      const { data, error } = await authed
        .from("orders")
        .select("id, customer_name, customer_phone, delivery_address, customer_notes, payment_method, payment_status, quantity, unit_price_mad, total_mad, commission_mad, status, created_at, meals(title)")
        .eq("id", orderId)
        .single();
      if (error) fail(error, "Could not reload the order.");
      return toChefOrder(data as Record<string, unknown>);
    },

    async adminOverview(): Promise<AdminOverview> {
      const serviceDate = todayInCasablanca();
      const [ordersQuery, chefsQuery, driversQuery] = await Promise.all([
        authed
          .from("orders")
          .select("id, chef_id, driver_id, customer_name, customer_phone, delivery_address, customer_notes, payment_method, payment_status, quantity, unit_price_mad, total_mad, commission_mad, delivery_fee_mad, driver_commission_mad, status, created_at, meals(title), chefs(kitchen_name, city)")
          .order("created_at", { ascending: false }),
        authed.from("chefs").select("id, kitchen_name, city").eq("is_active", true),
        authed.from("drivers").select("id, full_name, phone, email, city, vehicle, status, created_at").order("created_at", { ascending: false }),
      ]);
      if (ordersQuery.error) fail(ordersQuery.error, "Could not load orders.");
      if (chefsQuery.error) fail(chefsQuery.error, "Could not load kitchens.");
      if (driversQuery.error) fail(driversQuery.error, "Could not load drivers.");
      const rows = (ordersQuery.data ?? []) as Record<string, unknown>[];
      const documentQuery = await authed.from("driver_documents").select("id, driver_id, kind, content_type");
      const documentsByDriver = new Map<string, DriverDocumentMeta[]>();
      if (!documentQuery.error) {
        for (const row of (documentQuery.data ?? []) as Record<string, unknown>[]) {
          const driverId = String(row.driver_id);
          const list = documentsByDriver.get(driverId) ?? [];
          list.push({
            id: String(row.id),
            kind: row.kind as DocumentKind,
            contentType: String(row.content_type),
          });
          documentsByDriver.set(driverId, list);
        }
      }
      const drivers = ((driversQuery.data ?? []) as Record<string, unknown>[]).map((row) =>
        toDriverRecord(row, documentsByDriver.get(String(row.id)) ?? []),
      );
      const driverNames = new Map(drivers.map((driver) => [driver.id, driver.fullName]));
      const todayRows = rows.filter((row) => todayInCasablanca(new Date(String(row.created_at))) === serviceDate);
      const kitchens: KitchenStat[] = ((chefsQuery.data ?? []) as Record<string, unknown>[]).map((chef) => {
        const mine = todayRows.filter((row) => row.chef_id === chef.id && row.status !== "cancelled");
        const money = snapshot(mine);
        return {
          chefId: String(chef.id),
          kitchenName: String(chef.kitchen_name),
          city: String(chef.city ?? ""),
          orders: money.orders,
          portions: money.portions,
          revenueMad: money.grossRevenueMad,
          commissionMad: money.commissionMad,
          payoutMad: money.chefPayoutMad,
        };
      });
      const activeDeliveries: ActiveDelivery[] = rows
        .filter((row) => row.status === "assigned" || row.status === "picked_up")
        .map((row) => ({
          ...toJob(row),
          driverName: driverNames.get(String(row.driver_id ?? "")) ?? "Driver",
        }));
      return {
        commissionPerMealMad: PLATFORM_COMMISSION_MAD,
        deliveryFeeMad: DELIVERY_FEE_MAD,
        driverCommissionPerTripMad: DRIVER_COMMISSION_MAD,
        chefWalletCommissionMad: 1,
        driverWalletCommissionMad: 1,
        serviceDate,
        today: snapshot(todayRows),
        allTime: snapshot(rows),
        todayBooks: financeOf(rowsOnDate(rows.map(moneyRow), serviceDate)),
        weekBooks: financeOf(rowsThisWeek(rows.map(moneyRow))),
        openOrders: rows.filter((row) =>
          row.status === "pending" ||
          row.status === "confirmed" ||
          row.status === "assigned" ||
          row.status === "picked_up",
        ).length,
        cancelledOrders: rows.filter((row) => row.status === "cancelled").length,
        kitchens,
        recentOrders: rows.slice(0, 12).map(toRecent),
        drivers,
        activeDeliveries,
      };
    },

    async driverBoard(driverId: string): Promise<DriverBoard> {
      const driverQuery = await authed
        .from("drivers")
        .select("id, full_name, phone, city, vehicle, status, created_at")
        .eq("id", driverId)
        .maybeSingle();
      if (driverQuery.error) fail(driverQuery.error, "Could not load the driver profile.");
      if (!driverQuery.data) throw new StoreError("That driver could not be found.", 404);
      const driver = toDriverRecord(driverQuery.data as Record<string, unknown>);
      const ordersQuery = await authed.from("orders").select(ORDER_JOB_SELECT).order("created_at", { ascending: true });
      if (ordersQuery.error) fail(ordersQuery.error, "Could not load deliveries.");
      const jobs = ((ordersQuery.data ?? []) as Record<string, unknown>[]).map((row) => ({
        driverId: row.driver_id ? String(row.driver_id) : null,
        job: toJob(row),
      }));
      const available =
        driver.status === "approved"
          ? jobs
              .filter((item) => item.job.status === "confirmed" && item.driverId === null && item.job.city === driver.city)
              .map((item) => item.job)
          : [];
      const mine = jobs.filter((item) => item.driverId === driver.id).map((item) => item.job);
      const completed = mine.filter((job) => job.status === "delivered");
      const fees = completed.reduce((sum, job) => sum + job.deliveryFeeMad, 0);
      const commission = completed.reduce((sum, job) => sum + job.driverCommissionMad, 0);
      return {
        city: driver.city,
        accountStatus: driver.status,
        available,
        active: mine.filter((job) => job.status === "assigned" || job.status === "picked_up"),
        completed,
        earnings: {
          trips: completed.length,
          feesMad: roundMoney(fees),
          commissionMad: roundMoney(commission),
          netMad: roundMoney(fees - commission),
        },
      };
    },

    async acceptDelivery(driverId: string, orderId: string): Promise<DeliveryJob> {
      const { error } = await authed.rpc("accept_delivery", { p_order_id: orderId });
      if (error) fail(error, "Could not accept the delivery.");
      return loadJob(authed, orderId, driverId);
    },

    async advanceDelivery(
      driverId: string,
      orderId: string,
      action: "pick_up" | "deliver" | "release",
      code?: string,
    ): Promise<DeliveryJob> {
      const { error } = await authed.rpc("advance_delivery", {
        p_order_id: orderId,
        p_action: action,
        p_code: code ?? "",
      });
      if (error) fail(error, "Could not update the delivery.");
      return loadJob(authed, orderId, action === "release" ? null : driverId);
    },

    async setDriverStatus(driverId: string, status: "approved" | "rejected" | "postponed"): Promise<DriverRecord> {
      const stored = status === "postponed" ? "pending" : status;
      if (status === "approved") {
        const existing = await authed.from("drivers").select("id, email, vehicle").eq("id", driverId).maybeSingle();
        if (existing.error) fail(existing.error, "Could not load the driver profile.");
        if (!existing.data) throw new StoreError("That driver could not be found.", 404);
        const ready = await driverDocumentsReady(
          authed,
          driverId,
          asVehicle(existing.data.vehicle),
          String(existing.data.email ?? ""),
        );
        if (!ready) throw new StoreError("This driver still needs the required documents.", 409);
      }
      const { data, error } = await authed
        .from("drivers")
        .update({ status: stored })
        .eq("id", driverId)
        .select("id, full_name, phone, email, city, vehicle, status, created_at")
        .maybeSingle();
      if (error) fail(error, "Could not update the driver.");
      if (!data) throw new StoreError("That driver could not be found.", 404);
      const readyDocs = await authed.from("driver_documents").select("id, kind, content_type").eq("driver_id", driverId);
      const documents = readyDocs.error
        ? []
        : ((readyDocs.data ?? []) as Record<string, unknown>[]).map((row) => ({
            id: String(row.id),
            kind: row.kind as DocumentKind,
            contentType: String(row.content_type),
          }));
      return toDriverRecord(data as Record<string, unknown>, documents);
    },

    async listCustomerOrders(phone: string): Promise<CustomerOrder[]> {
      const { data, error } = await authed
        .from("orders")
        .select("id, customer_phone, delivery_address, customer_notes, quantity, total_mad, delivery_fee_mad, delivery_code, status, created_at, meals(title), chefs(kitchen_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) fail(error, "Could not load your orders.");
      return ((data ?? []) as Record<string, unknown>[])
        .filter((row) => String(row.customer_phone ?? "").replace(/\D/g, "") === phone)
        .map((row) => {
          const meal = one(row.meals as MealEmbed | MealEmbed[] | null);
          const chef = one(row.chefs as { kitchen_name: string } | Array<{ kitchen_name: string }> | null);
          return {
            id: String(row.id),
            mealTitle: meal?.title ?? "Meal",
            kitchenName: chef?.kitchen_name ?? "Kitchen",
            deliveryAddress: String(row.delivery_address ?? ""),
            quantity: num(row.quantity),
            totalMad: num(row.total_mad),
            deliveryFeeMad: num(row.delivery_fee_mad ?? DELIVERY_FEE_MAD),
            customerNotes: String(row.customer_notes ?? ""),
            status: row.status as CustomerOrder["status"],
            deliveryCode: String(row.delivery_code ?? ""),
            createdAt: String(row.created_at),
          };
        });
    },

    async saveDriverDocument(
      driverId: string,
      kind: DocumentKind,
      contentType: "image/jpeg" | "image/png" | "image/webp",
      bytes: Buffer,
    ): Promise<void> {
      const driverQuery = await authed.from("drivers").select("id, profile_id, vehicle").eq("id", driverId).maybeSingle();
      if (driverQuery.error) fail(driverQuery.error, "Could not load the driver profile.");
      if (!driverQuery.data) throw new StoreError("That driver could not be found.", 404);
      if (!requiredDocumentKinds(asVehicle(driverQuery.data.vehicle)).includes(kind)) {
        throw new StoreError("That document is not required for this vehicle.", 400);
      }
      const storagePath = `${driverQuery.data.profile_id}/${randomUUID()}.${extensionFor(contentType)}`;
      const upload = await authed.storage.from("driver-documents").upload(storagePath, bytes, { contentType, upsert: false });
      if (upload.error) fail(upload.error, "Could not store the document.");
      const saved = await authed.from("driver_documents").upsert(
        { driver_id: driverId, kind, storage_path: storagePath, content_type: contentType },
        { onConflict: "driver_id,kind" },
      );
      if (saved.error) fail(saved.error, "Could not store the document.");
    },

    async readDriverDocument(documentId: string): Promise<{ bytes: Buffer; contentType: string }> {
      const rowQuery = await authed
        .from("driver_documents")
        .select("storage_path, content_type")
        .eq("id", documentId)
        .maybeSingle();
      if (rowQuery.error) fail(rowQuery.error, "Could not load the document.");
      if (!rowQuery.data) throw new StoreError("That document could not be found.", 404);
      const file = await authed.storage.from("driver-documents").download(String(rowQuery.data.storage_path));
      if (file.error || !file.data) fail(file.error, "Could not load the document.");
      return {
        bytes: Buffer.from(await file.data.arrayBuffer()),
        contentType: String(rowQuery.data.content_type),
      };
    },

    async trackOrder(token: string): Promise<OrderTracking> {
      const { data, error } = await anon.rpc("track_order", { p_token: token });
      if (error) fail(error, "Could not load the order.");
      const row = (data ?? {}) as Record<string, unknown>;
      if (!row.deliveryCode && !row.delivery_code) throw new StoreError("That order could not be found.", 404);
      return {
        mealTitle: String(row.mealTitle ?? row.meal_title ?? "Meal"),
        kitchenName: String(row.kitchenName ?? row.kitchen_name ?? "Kitchen"),
        deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? ""),
        quantity: num(row.quantity),
        totalMad: num(row.totalMad ?? row.total_mad),
        deliveryFeeMad: num(row.deliveryFeeMad ?? row.delivery_fee_mad ?? DELIVERY_FEE_MAD),
        customerNotes: String(row.customerNotes ?? row.customer_notes ?? ""),
        status: row.status as OrderStatus,
        deliveryCode: String(row.deliveryCode ?? row.delivery_code),
        createdAt: String(row.createdAt ?? row.created_at),
      };
    },

    async listPendingChefs(): Promise<Chef[]> {
      const query = await authed
        .from("chefs")
        .select("id, kitchen_name, city, approval_status, cin_storage_path, auto_entrepreneur_number, food_safety_accepted_at, profile_id")
        .eq("approval_status", "pending");
      if (query.error) return [];
      const docs = await authed.from("chef_documents").select("id, chef_id, kind").eq("kind", "cin_front");
      const profiles = await authed.from("profiles").select("id, full_name");
      return ((query.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        kitchenName: String(row.kitchen_name),
        city: String(row.city ?? ""),
        fullName: String(
          ((profiles.data ?? []) as Record<string, unknown>[]).find((item) => item.id === row.profile_id)?.full_name ?? row.kitchen_name,
        ),
        cin_storage_path: row.cin_storage_path ? String(row.cin_storage_path) : null,
        auto_entrepreneur_number: row.auto_entrepreneur_number ? String(row.auto_entrepreneur_number) : null,
        food_safety_accepted_at: row.food_safety_accepted_at ? String(row.food_safety_accepted_at) : null,
        approval_status: "pending",
        cinDocumentId: String(
          ((docs.data ?? []) as Record<string, unknown>[]).find((item) => item.chef_id === row.id)?.id ?? "",
        ) || null,
        ownerId: String(row.profile_id ?? row.id),
        phone: null,
        bio: "",
        documents: [],
        is_active: true,
        postponed: false,
        balanceMad: 0,
        createdAt: "",
      }));
    },

    async setChefApproval(chefId: string, status: "approved" | "rejected" | "postponed"): Promise<Chef> {
      const nextStatus = status === "postponed" ? "pending" : status;
      const updated = await authed.from("chefs").update({ approval_status: nextStatus }).eq("id", chefId).select("id, kitchen_name, city, approval_status, cin_storage_path, auto_entrepreneur_number, food_safety_accepted_at, profile_id").maybeSingle();
      if (updated.error) fail(updated.error, "Could not update the kitchen.");
      if (!updated.data) throw new StoreError("That kitchen could not be found.", 404);
      const row = updated.data as Record<string, unknown>;
      return {
        id: String(row.id),
        kitchenName: String(row.kitchen_name),
        city: String(row.city ?? ""),
        fullName: String(row.kitchen_name),
        cin_storage_path: row.cin_storage_path ? String(row.cin_storage_path) : null,
        auto_entrepreneur_number: row.auto_entrepreneur_number ? String(row.auto_entrepreneur_number) : null,
        food_safety_accepted_at: row.food_safety_accepted_at ? String(row.food_safety_accepted_at) : null,
        approval_status: nextStatus,
        cinDocumentId: null,
        ownerId: String(row.profile_id ?? row.id),
        phone: null,
        bio: "",
        documents: [],
        is_active: nextStatus !== "rejected",
        postponed: status === "postponed",
        balanceMad: 0,
        createdAt: "",
      };
    },

    async removeChef(): Promise<void> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async removeDriver(): Promise<void> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async saveChefDocument(
      chefId: string,
      kind: ChefDocumentKind,
      contentType: "image/jpeg" | "image/png" | "image/webp",
      bytes: Buffer,
    ): Promise<void> {
      const chefQuery = await authed.from("chefs").select("id, profile_id").eq("id", chefId).maybeSingle();
      if (chefQuery.error) fail(chefQuery.error, "Could not load the kitchen.");
      if (!chefQuery.data) throw new StoreError("That kitchen could not be found.", 404);
      const storagePath = `${chefQuery.data.profile_id}/${randomUUID()}.${extensionFor(contentType)}`;
      const upload = await authed.storage.from("chef-documents").upload(storagePath, bytes, { contentType, upsert: false });
      if (upload.error) fail(upload.error, "Could not store the document.");
      const saved = await authed.from("chef_documents").upsert(
        { chef_id: chefId, kind, storage_path: storagePath, content_type: contentType },
        { onConflict: "chef_id,kind" },
      );
      if (saved.error) fail(saved.error, "Could not store the document.");
      if (kind === "cin_front") {
        await authed.from("chefs").update({ cin_storage_path: storagePath }).eq("id", chefId);
      }
    },

    async readChefDocument(documentId: string): Promise<{ bytes: Buffer; contentType: string }> {
      const rowQuery = await authed.from("chef_documents").select("storage_path, content_type").eq("id", documentId).maybeSingle();
      if (rowQuery.error) fail(rowQuery.error, "Could not load the document.");
      if (!rowQuery.data) throw new StoreError("That document could not be found.", 404);
      const file = await authed.storage.from("chef-documents").download(String(rowQuery.data.storage_path));
      if (file.error || !file.data) fail(file.error, "Could not load the document.");
      return { bytes: Buffer.from(await file.data.arrayBuffer()), contentType: String(rowQuery.data.content_type) };
    },

    async saveMealPhoto(
      _mealId: string,
      _contentType: "image/jpeg" | "image/png" | "image/webp",
      _bytes: Buffer,
    ): Promise<void> {
      console.warn("[supabase] meal photo storage is not available yet.");
    },

    async readMealPhoto(_mealId: string): Promise<{ bytes: Buffer; contentType: string }> {
      throw new StoreError("That photo could not be found.", 404);
    },

    async addEmailCapture(email: string, source: string): Promise<void> {
      const inserted = await authed.from("email_captures").insert({ email, source, created_at: new Date().toISOString() });
      if (inserted.error) {
        console.warn("[supabase] email_captures table is not available yet.", inserted.error.message);
      }
    },

    async listEmailCaptures(): Promise<Array<{ email: string; created_at: string; source: string }>> {
      const query = await authed.from("email_captures").select("email, created_at, source");
      if (query.error) {
        console.warn("[supabase] email_captures table is not available yet.", query.error.message);
        return [];
      }
      return (query.data ?? []) as Array<{ email: string; created_at: string; source: string }>;
    },

    async saveChefSignature(chefId: string, signature: string): Promise<void> {
      const updated = await authed.from("chefs").update({ signature_data_url: signature }).eq("id", chefId);
      if (updated.error) console.warn("[supabase] chefs.signature_data_url is not available yet.", updated.error.message);
    },

    async saveDriverSignature(driverId: string, signature: string): Promise<void> {
      const updated = await authed.from("drivers").update({ signature_data_url: signature }).eq("id", driverId);
      if (updated.error) console.warn("[supabase] drivers.signature_data_url is not available yet.", updated.error.message);
    },

    async saveProfileExtras(
      _userId: string,
      _input: {
        avatarDataUrl?: string | null;
        bio?: string;
        city?: string;
        kitchenPhotoDataUrl?: string | null;
        notes?: string;
        vehiclePhotoDataUrl?: string | null;
        licensePhotoDataUrl?: string | null;
      },
    ): Promise<void> {
      console.warn("[supabase] optional profile columns are not available yet.");
    },

    async attachOrderEmail(orderId: string, email: string): Promise<void> {
      const { error } = await anon.rpc("attach_order_email", { p_order_id: orderId, p_email: email });
      if (error) fail(error, "Could not save the email.");
    },

    async walletView(): Promise<WalletView> {
      return { balanceMad: 0, transactions: [] };
    },

    async adjustWallet(): Promise<WalletView> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async listMessages(): Promise<ChatThread | null> {
      return null;
    },

    async listMessageThreads(): Promise<ChatThread[]> {
      return [];
    },

    async sendMessage(): Promise<ChatThread> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async openDirectThread(): Promise<DirectThread> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async listDirectThreads(): Promise<DirectThread[]> {
      return [];
    },

    async sendDirectMessage(): Promise<DirectThread> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async updateCommissionSettings(): Promise<CommissionSettings> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async updateMeal(): Promise<ChefMeal> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async deleteMeal(): Promise<void> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async withdrawChef(): Promise<void> {
      throw new StoreError("Supabase is not configured. Add the URL and anon key.", 500);
    },

    async listStaff(): Promise<StaffAccount[]> {
      return [];
    },
  };
}

async function loadJob(supabase: SupabaseClient, orderId: string, driverId: string | null): Promise<DeliveryJob> {
  const { data, error } = await supabase.from("orders").select(ORDER_JOB_SELECT).eq("id", orderId).maybeSingle();
  if (error) fail(error, "Could not reload the delivery.");
  if (!data) throw new StoreError("That delivery could not be found.", 404);
  const row = data as Record<string, unknown>;
  if (driverId && String(row.driver_id ?? "") !== driverId) {
    throw new StoreError("That delivery is not yours.", 404);
  }
  return toJob(row);
}
