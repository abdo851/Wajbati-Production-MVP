import { cookies } from "next/headers";
import { LoginFailure, StoreError } from "@/lib/errors";
import { authenticate, authenticateCustomer, authenticateDriver, dataProvider, findUser } from "@/lib/db";
import { freshExpiry, openSession, sealSession, SESSION_COOKIE, type SessionPayload } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/super-admin";
import type { AuthUser } from "@/lib/types";

export type CurrentUser = {
  user: AuthUser;
  accessToken?: string;
};

async function payload(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const session = openSession(jar.get(SESSION_COOKIE)?.value);
  if (!session || session.provider !== dataProvider()) return null;
  return session;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await payload();
  if (!session) return null;
  if (session.provider === "supabase") {
    if (!session.accessToken) return null;
    const user = await findUser(session.userId ?? "", session.accessToken);
    return user ? { user, accessToken: session.accessToken } : null;
  }
  if (!session.userId) return null;
  const user = await findUser(session.userId);
  return user ? { user } : null;
}

export async function requireDesk(desk: "chef" | "admin" | "driver"): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) throw new StoreError("Sign in to continue.", 401);
  if (desk === "admin" && !isSuperAdmin(current.user)) {
    throw new StoreError("Sign in to continue.", 401);
  }
  if (current.user.role !== desk) {
    throw new StoreError(deskMessage(current.user.role), 403);
  }
  if (desk === "chef" && !current.user.chefId) {
    throw new StoreError("This chef account is not linked to a kitchen yet.", 403);
  }
  if (desk === "driver" && !current.user.driverId) {
    throw new StoreError("This driver profile is incomplete.", 403);
  }
  return current;
}

function deskMessage(role: AuthUser["role"]): string {
  if (role === "admin") return "Those credentials were not recognized.";
  if (role === "driver") return "This account opens the driver route.";
  if (role === "customer") return "This account opens your profile.";
  return "This account opens the chef kitchen.";
}

export async function login(email: string, password: string, desk: "chef" | "admin"): Promise<{
  user: AuthUser;
  token: string;
}> {
  const result = await authenticate(email, password);
  if (!result) throw new LoginFailure("user not found");
  if (desk === "admin" && !isSuperAdmin(result.user)) {
    throw new LoginFailure("user not found");
  }
  if (result.user.role !== desk) {
    throw new StoreError(deskMessage(result.user.role), 403);
  }
  if (desk === "chef" && !result.user.chefId) {
    throw new StoreError("This chef account is not linked to a kitchen yet.", 403);
  }
  if (desk === "chef") {
    const approval = result.user.approvalStatus ?? result.user.chefApprovalStatus;
    if (approval === "pending" || approval === "rejected") {
      throw new StoreError("Your account is under review. You cannot publish meals until approved.", 403);
    }
  }
  return { user: result.user, token: seal(result.user.id, result.accessToken) };
}

export async function loginDriver(identifier: string, password: string): Promise<{
  user: AuthUser;
  token: string;
}> {
  const result = await authenticateDriver(identifier, password);
  if (!result) throw new StoreError("Those credentials were not recognized.", 401);
  if (result.user.role !== "driver" || !result.user.driverId) {
    throw new StoreError(deskMessage(result.user.role), 403);
  }
  if (result.user.driverStatus && result.user.driverStatus !== "approved") {
    throw new StoreError("Your application is still waiting for approval.", 403);
  }
  return { user: result.user, token: seal(result.user.id, result.accessToken) };
}

export async function loginCustomer(identifier: string, password: string): Promise<{
  user: AuthUser;
  token: string;
}> {
  const result = await authenticateCustomer(identifier, password);
  if (!result || result.user.role !== "customer") {
    throw new StoreError("Those credentials were not recognized.", 401);
  }
  return { user: result.user, token: seal(result.user.id, result.accessToken) };
}

export function issueSession(userId: string, accessToken?: string): string {
  return seal(userId, accessToken);
}

function seal(userId: string, accessToken?: string): string {
  const session: SessionPayload = accessToken
    ? { provider: "supabase", accessToken, userId, exp: freshExpiry() }
    : { provider: "local", userId, exp: freshExpiry() };
  return sealSession(session);
}
