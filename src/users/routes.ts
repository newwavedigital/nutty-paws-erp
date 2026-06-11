import type { Hono } from "hono";
import { ApiError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject, requireFields } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAnyRole, requireAuth } from "../auth/guards";
import {
  asRoleName,
  hashPassword,
  normalizeEmail,
  serializeUser,
  type AuthStore,
  type AuthUserRecord,
  type CustomerAccessRecord,
  type RoleName,
} from "../auth/service";

export type UserAdminStore = AuthStore & {
  listUsers(): Promise<AuthUserRecord[]>;
  updateUser(
    userId: string,
    input: Partial<Pick<AuthUserRecord, "displayName" | "userType" | "passwordHash" | "isActive">>,
  ): Promise<AuthUserRecord | null>;
};

type StoreFactory = (db: D1Database) => UserAdminStore;

export function registerUserRoutes(app: Hono<AppBindings>, createStore: StoreFactory = (db) => new D1AuthStore(db)) {
  app.get("/api/users", async (c) => {
    const store = createStore(c.env?.DB);
    const auth = await requireAuth(c, store);
    requireAnyRole(auth, ["Admin"]);
    return ok(c, await serializeUsers(store));
  });

  app.post("/api/users", async (c) => {
    const store = createStore(c.env?.DB);
    const auth = await requireAuth(c, store);
    requireAnyRole(auth, ["Admin"]);
    const body = await parseJsonObject(c);
    const fields = requireFields(body, ["email", "displayName", "password", "roles"]);
    const roles = asRoles(fields.roles);
    const customerAccess = customerAccessForRoles(roles, optionalString(body.customerId, "customerId"));
    const user: AuthUserRecord = {
      id: `user_${crypto.randomUUID()}`,
      email: normalizeEmail(asString(fields.email, "email")),
      displayName: asString(fields.displayName, "displayName").trim(),
      userType: roles.includes("Customer") ? "customer" : "employee",
      passwordHash: await hashPassword(asString(fields.password, "password")),
      isActive: true,
    };

    await store.createUser(user);
    await store.setUserRoles(user.id, roles);
    await store.setCustomerAccess(user.id, customerAccess);

    return ok(c, serializeUser(user, roles, customerAccess));
  });

  app.patch("/api/users/:userId", async (c) => {
    const store = createStore(c.env?.DB);
    const auth = await requireAuth(c, store);
    requireAnyRole(auth, ["Admin"]);
    const body = await parseJsonObject(c);
    const roles = Array.isArray(body.roles) ? asRoles(body.roles) : null;
    const customerAccess = roles ? customerAccessForRoles(roles, optionalString(body.customerId, "customerId")) : null;
    const updated = await store.updateUser(c.req.param("userId"), {
      displayName: optionalString(body.displayName, "displayName"),
      userType: roles?.includes("Customer") ? "customer" : roles ? "employee" : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    if (!updated) throw new ApiError("USER_NOT_FOUND", "User not found", 404);
    if (roles) await store.setUserRoles(updated.id, roles);
    if (customerAccess) await store.setCustomerAccess(updated.id, customerAccess);

    return ok(c, serializeUser(updated, roles ?? (await store.listUserRoles(updated.id)).map(asRoleName), customerAccess ?? await store.listCustomerAccess(updated.id)));
  });

  app.delete("/api/users/:userId", async (c) => {
    const store = createStore(c.env?.DB);
    const auth = await requireAuth(c, store);
    requireAnyRole(auth, ["Admin"]);
    const updated = await store.updateUser(c.req.param("userId"), { isActive: false });
    if (!updated) throw new ApiError("USER_NOT_FOUND", "User not found", 404);
    return ok(c, { deactivated: true, user: serializeUser(updated, await rolesFor(store, updated.id), await store.listCustomerAccess(updated.id)) });
  });
}

async function serializeUsers(store: UserAdminStore) {
  const users = await store.listUsers();
  return Promise.all(users.map(async (user) => serializeUser(user, await rolesFor(store, user.id), await store.listCustomerAccess(user.id))));
}

async function rolesFor(store: UserAdminStore, userId: string) {
  return (await store.listUserRoles(userId)).map(asRoleName);
}

function customerAccessForRoles(roles: RoleName[], customerId: string | undefined): CustomerAccessRecord[] {
  if (!roles.includes("Customer")) return [];
  if (!customerId) throw new ApiError("VALIDATION_ERROR", "Customer users must be linked to a customer", 400, { fields: ["customerId"] });
  return [{ customerId, accessLevel: "manager" }];
}

function asRoles(value: unknown): RoleName[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "roles must be a non-empty array", 400, { fields: ["roles"] });
  }
  return value.map((role) => asRoleName(asString(role, "roles")));
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a non-empty string`, 400, { fields: [field] });
  }
  return value;
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, field);
}
