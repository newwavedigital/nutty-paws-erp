import type { Hono } from "hono";
import { ApiError, ValidationError } from "../api/errors";
import { ok } from "../api/responses";
import { parseJsonObject } from "../api/validation";
import type { AppBindings } from "../app";
import { D1AuthStore } from "../auth/d1-store";
import { requireAuth, requireAuthWhenEnabled, requireEmployee } from "../auth/guards";
import type { AuthStore, AuthContext } from "../auth/service";
import { D1CustomerStore } from "./d1-store";
import type { CustomerStatus, CustomerStore, CustomerUpdateInput } from "./service";

type CustomerStoreFactory = (db: D1Database) => CustomerStore;
type AuthStoreFactory = (db: D1Database) => AuthStore;

const customerStatuses = new Set<CustomerStatus>(["active", "inactive"]);

export function registerCustomerRoutes(
  app: Hono<AppBindings>,
  createCustomerStore: CustomerStoreFactory = (db) => new D1CustomerStore(db),
  createAuthStore: AuthStoreFactory = (db) => new D1AuthStore(db),
) {
  app.get("/api/customers/me", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuth(c, createAuthStore(db));
    const customerId = firstLinkedCustomerId(auth);
    const customer = await createCustomerStore(db).getCustomer(customerId);
    if (!customer) throw new ApiError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    return ok(c, customer);
  });

  app.get("/api/customers", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    return ok(c, await createCustomerStore(db).listCustomers());
  });

  app.get("/api/customers/:customerId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const customer = await createCustomerStore(db).getCustomer(c.req.param("customerId"));
    if (!customer) throw new ApiError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    return ok(c, customer);
  });

  app.patch("/api/customers/:customerId", async (c) => {
    const db = c.env?.DB;
    const auth = await requireAuthWhenEnabled(c, createAuthStore(db));
    if (auth) requireEmployee(auth);
    const body = await parseJsonObject(c);
    const customer = await createCustomerStore(db).updateCustomer(c.req.param("customerId"), asCustomerUpdate(body));
    if (!customer) throw new ApiError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    return ok(c, customer);
  });
}

function firstLinkedCustomerId(auth: AuthContext) {
  const customerId = auth.customerAccess[0]?.customerId;
  if (!customerId) throw new ApiError("CUSTOMER_PROFILE_NOT_LINKED", "Customer user is not linked to a customer", 403);
  return customerId;
}

function asCustomerUpdate(body: Record<string, unknown>): CustomerUpdateInput {
  return {
    name: optionalString(body.name, "name"),
    contactName: optionalNullableString(body.contactName ?? body.contact, "contactName"),
    contactEmail: optionalNullableString(body.contactEmail ?? body.email, "contactEmail"),
    phone: optionalNullableString(body.phone, "phone"),
    status: optionalStatus(body.status),
  };
}

function optionalString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`, { fields: [field] });
  }
  return value.trim();
}

function optionalNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return optionalString(value, field);
}

function optionalStatus(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !customerStatuses.has(value as CustomerStatus)) {
    throw new ValidationError("status is invalid", { fields: ["status"] });
  }
  return value as CustomerStatus;
}
