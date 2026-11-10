import {
  authenticateLocal,
  authenticateLocalCustomer,
  authenticateLocalDriver,
  findLocalGoogle,
  findLocalUser,
  localRepository,
  confirmLocalEmail,
  registerLocalChef,
  registerLocalCustomer,
  registerLocalDriver,
  registerLocalGoogleCustomer,
  updateLocalCustomer,
} from "@/lib/db/local-store";
import {
  authenticateSupabase,
  authenticateSupabaseCustomer,
  authenticateSupabaseDriver,
  completeSupabaseStaff,
  createSupabaseRepository,
  findSupabaseUser,
  registerSupabaseChef,
  registerSupabaseCustomer,
  registerSupabaseDriver,
  updateSupabaseCustomer,
} from "@/lib/db/supabase-store";
import type {
  ChefApplication,
  CustomerAccountInput,
  DataProvider,
  DriverApplication,
  GoogleIdentity,
} from "@/lib/types";

export function dataProvider(): DataProvider {
  return process.env.DATA_PROVIDER === "supabase" ? "supabase" : "local";
}

export function getRepository(accessToken?: string) {
  if (dataProvider() === "supabase") return createSupabaseRepository(accessToken);
  return localRepository;
}

export async function authenticate(email: string, password: string) {
  if (dataProvider() === "supabase") return authenticateSupabase(email, password);
  const user = await authenticateLocal(email, password);
  return user ? { user, accessToken: undefined } : null;
}

export async function findUser(userId: string, accessToken?: string) {
  if (dataProvider() === "supabase") {
    if (!accessToken) return null;
    return findSupabaseUser(accessToken);
  }
  return findLocalUser(userId);
}

export async function authenticateDriver(identifier: string, password: string) {
  if (dataProvider() === "supabase") return authenticateSupabaseDriver(identifier, password);
  const user = await authenticateLocalDriver(identifier, password);
  return user ? { user, accessToken: undefined } : null;
}

export async function registerDriver(input: DriverApplication, googleSub: string | null = null) {
  if (dataProvider() === "supabase") {
    await registerSupabaseDriver(input);
    console.warn("[supabase] driver email confirmation is not available yet.");
    return { user: null, confirmationToken: "", accessToken: undefined as string | undefined };
  }
  const created = await registerLocalDriver(input, googleSub);
  return { user: created.user, confirmationToken: created.confirmationToken, accessToken: undefined as string | undefined };
}

export async function registerChef(input: ChefApplication, googleSub: string | null = null) {
  if (dataProvider() === "supabase") {
    const created = await registerSupabaseChef(input);
    console.warn("[supabase] chef email confirmation is not available yet.");
    return { user: created.user, accessToken: created.accessToken, confirmationToken: "" };
  }
  const created = await registerLocalChef(input, googleSub);
  return { user: created.user, accessToken: undefined as string | undefined, confirmationToken: created.confirmationToken };
}

export async function confirmEmail(token: string) {
  if (dataProvider() === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.warn("[supabase] email confirmation skipped because the project URL is not set.");
      return false;
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key);
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "email" });
    if (error) {
      console.warn("[supabase] verifyOtp did not confirm the address.", error.message);
      return false;
    }
    return true;
  }
  return confirmLocalEmail(token);
}

export async function registerCustomer(input: CustomerAccountInput) {
  if (dataProvider() === "supabase") return registerSupabaseCustomer(input);
  const user = await registerLocalCustomer(input);
  return { user, accessToken: undefined as string | undefined };
}

export async function authenticateCustomer(identifier: string, password: string) {
  if (dataProvider() === "supabase") return authenticateSupabaseCustomer(identifier, password);
  const user = await authenticateLocalCustomer(identifier, password);
  return user ? { user, accessToken: undefined } : null;
}

export async function updateCustomer(userId: string, input: { fullName: string; phone: string }, accessToken?: string) {
  if (dataProvider() === "supabase") {
    if (!accessToken) return null;
    return updateSupabaseCustomer(accessToken, input);
  }
  return updateLocalCustomer(userId, input);
}

export async function findGoogleAccount(identity: GoogleIdentity) {
  if (dataProvider() === "supabase") return null;
  return findLocalGoogle(identity);
}

export async function registerGoogleCustomer(identity: GoogleIdentity) {
  if (dataProvider() === "supabase") return null;
  return registerLocalGoogleCustomer(identity);
}

export async function finishSupabaseStaff(
  accessToken: string,
  role: "chef" | "driver",
  fields: { fullName: string; phone: string; city: string; vehicle: string; kitchenName: string },
) {
  return completeSupabaseStaff(accessToken, role, fields);
}
