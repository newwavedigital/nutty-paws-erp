import type { Context } from "hono";
import { AuthError, type AuthContext, type AuthStore, type RoleName } from "./service";
import { requireBearerAuth } from "./routes";
import type { AppBindings } from "../app";

export function isAuthRequired(c: Context<AppBindings>) {
  return String(c.env?.AUTH_REQUIRED ?? "false") === "true";
}

export async function getAuthContext(c: Context<AppBindings>, store: AuthStore) {
  const existing = c.get("auth");
  if (existing) return existing;
  const context = await requireBearerAuth(c.req.header("authorization"), store);
  c.set("auth", context);
  return context;
}

export async function requireAuthWhenEnabled(c: Context<AppBindings>, store: AuthStore) {
  if (!isAuthRequired(c)) return null;
  return getAuthContext(c, store);
}

export async function requireAuth(c: Context<AppBindings>, store: AuthStore) {
  return getAuthContext(c, store);
}

export function requireAnyRole(context: AuthContext, allowedRoles: RoleName[]) {
  if (context.roles.includes("Admin")) return;
  if (allowedRoles.some((role) => context.roles.includes(role))) return;
  throw new AuthError("FORBIDDEN", "You do not have access to this action");
}

export function requireEmployee(context: AuthContext) {
  if (context.user.userType === "employee" || context.roles.includes("Admin")) return;
  throw new AuthError("FORBIDDEN", "Customers cannot access this action");
}

export function hasCustomerAccess(context: AuthContext, customerId: string) {
  if (context.roles.includes("Admin")) return true;
  return context.customerAccess.some((access) => access.customerId === customerId);
}

export function requireCustomerAccess(context: AuthContext, customerId: string) {
  if (hasCustomerAccess(context, customerId)) return;
  throw new AuthError("FORBIDDEN", "Customer access is limited to linked records");
}
