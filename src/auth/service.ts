import { ApiError } from "../api/errors";

export const ROLE_NAMES = [
  "Admin",
  "Sales",
  "Supply Chain & Procurement",
  "Warehousing",
  "Production",
  "Customer",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type UserType = "employee" | "customer";
export type CustomerAccessLevel = "viewer" | "manager";

export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  userType: UserType;
  passwordHash: string | null;
  isActive: boolean;
};

export type CustomerAccessRecord = {
  customerId: string;
  accessLevel: CustomerAccessLevel;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthContext = {
  user: AuthUserRecord;
  roles: RoleName[];
  customerAccess: CustomerAccessRecord[];
  sessionId?: string;
};

export type AuthStore = {
  getUserByEmail(email: string): Promise<AuthUserRecord | null>;
  getUserById(id: string): Promise<AuthUserRecord | null>;
  createUser(user: AuthUserRecord): Promise<void>;
  countUsers(): Promise<number>;
  listUserRoles(userId: string): Promise<string[]>;
  setUserRoles(userId: string, roleNames: RoleName[]): Promise<void>;
  listCustomerAccess(userId: string): Promise<CustomerAccessRecord[]>;
  setCustomerAccess(userId: string, access: CustomerAccessRecord[]): Promise<void>;
  createSession(session: AuthSessionRecord): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  revokeSession(sessionId: string): Promise<void>;
};

const PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 100000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export class AuthError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, authStatusFor(code));
    this.name = "AuthError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function asRoleName(value: string): RoleName {
  if (!ROLE_NAMES.includes(value as RoleName)) {
    throw new AuthError("INVALID_ROLE", "Role is not supported");
  }

  return value as RoleName;
}

export async function hashPassword(password: string) {
  assertPassword(password);
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return [PASSWORD_ALGORITHM, String(PASSWORD_ITERATIONS), toBase64(salt), toBase64(derived)].join("$");
}

export async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [algorithm, iterationsText, saltText, hashText] = storedHash.split("$");
  if (algorithm !== PASSWORD_ALGORITHM || !iterationsText || !saltText || !hashText) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const actual = await derivePassword(password, fromBase64(saltText), iterations);
  return constantTimeEqual(actual, fromBase64(hashText));
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSessionForUser(store: AuthStore, user: AuthUserRecord) {
  const token = toHex(randomBytes(32));
  const session: AuthSessionRecord = {
    id: `session_${crypto.randomUUID()}`,
    userId: user.id,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
  };

  await store.createSession(session);
  return { token, session };
}

export async function verifySessionToken(store: AuthStore, token: string): Promise<AuthContext> {
  if (!token) {
    throw new AuthError("UNAUTHORIZED", "Authentication is required");
  }

  const session = await store.getSessionByTokenHash(await sha256Hex(token));
  if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
    throw new AuthError("UNAUTHORIZED", "Session is no longer active");
  }

  const user = await store.getUserById(session.userId);
  if (!user || !user.isActive) {
    throw new AuthError("UNAUTHORIZED", "User is not active");
  }

  return {
    user,
    roles: normalizeRoles(await store.listUserRoles(user.id)),
    customerAccess: await store.listCustomerAccess(user.id),
    sessionId: session.id,
  };
}

export async function loginUser(store: AuthStore, email: string, password: string) {
  const user = await store.getUserByEmail(normalizeEmail(email));
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("UNAUTHORIZED", "Invalid email or password");
  }

  const session = await createSessionForUser(store, user);
  const context = await verifySessionToken(store, session.token);
  return { token: session.token, ...serializeAuthContext(context) };
}

export async function createFirstAdmin(
  store: AuthStore,
  input: { email: string; password: string; displayName: string },
) {
  if ((await store.countUsers()) > 0) {
    throw new AuthError("SETUP_ALREADY_COMPLETE", "First admin setup is already complete");
  }

  const user: AuthUserRecord = {
    id: `user_${crypto.randomUUID()}`,
    email: normalizeEmail(input.email),
    displayName: input.displayName.trim(),
    userType: "employee",
    passwordHash: await hashPassword(input.password),
    isActive: true,
  };

  if (!user.email || !user.displayName) {
    throw new AuthError("INVALID_USER", "Email and display name are required");
  }

  await store.createUser(user);
  await store.setUserRoles(user.id, ["Admin"]);
  await store.setCustomerAccess(user.id, []);

  const session = await createSessionForUser(store, user);
  const context = await verifySessionToken(store, session.token);
  return { token: session.token, ...serializeAuthContext(context) };
}

export function serializeAuthContext(context: AuthContext) {
  return {
    user: serializeUser(context.user, context.roles, context.customerAccess),
    roles: context.roles,
    customerAccess: context.customerAccess,
  };
}

export function serializeUser(user: AuthUserRecord, roles: RoleName[] = [], customerAccess: CustomerAccessRecord[] = []) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    userType: user.userType,
    isActive: user.isActive,
    roles,
    customerAccess,
  };
}

export function normalizeRoles(values: string[]) {
  return values.map(asRoleName);
}

function authStatusFor(code: string) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "SETUP_ALREADY_COMPLETE") return 409;
  return 400;
}

function assertPassword(password: string) {
  if (typeof password !== "string" || password.length < 8) {
    throw new AuthError("INVALID_PASSWORD", "Password must be at least 8 characters");
  }
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}
