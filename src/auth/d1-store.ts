import type {
  AuthSessionRecord,
  AuthStore,
  AuthUserRecord,
  CustomerAccessRecord,
  RoleName,
} from "./service";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  user_type: "employee" | "customer";
  password_hash: string | null;
  is_active: number;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

type RoleRow = { name: string };
type CustomerAccessRow = { customer_id: string; access_level: "viewer" | "manager" };

export class D1AuthStore implements AuthStore {
  constructor(private readonly db: D1Database) {}

  async getUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = await this.db
      .prepare(`SELECT id, email, display_name, user_type, password_hash, is_active FROM users WHERE lower(email) = lower(?)`)
      .bind(email)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async getUserById(id: string): Promise<AuthUserRecord | null> {
    const row = await this.db
      .prepare(`SELECT id, email, display_name, user_type, password_hash, is_active FROM users WHERE id = ?`)
      .bind(id)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async createUser(user: AuthUserRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO users (id, email, display_name, user_type, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(user.id, user.email, user.displayName, user.userType, user.passwordHash, user.isActive ? 1 : 0)
      .run();
  }

  async listUsers(): Promise<AuthUserRecord[]> {
    const result = await this.db
      .prepare(`SELECT id, email, display_name, user_type, password_hash, is_active FROM users ORDER BY email`)
      .all<UserRow>();
    return (result.results ?? []).map(mapUser);
  }

  async updateUser(
    userId: string,
    input: Partial<Pick<AuthUserRecord, "displayName" | "userType" | "passwordHash" | "isActive">>,
  ): Promise<AuthUserRecord | null> {
    const existing = await this.getUserById(userId);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    };
    await this.db
      .prepare(
        `UPDATE users
         SET display_name = ?, user_type = ?, password_hash = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(updated.displayName, updated.userType, updated.passwordHash, updated.isActive ? 1 : 0, userId)
      .run();
    return updated;
  }

  async countUsers(): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>();
    return row?.count ?? 0;
  }

  async listUserRoles(userId: string): Promise<string[]> {
    const result = await this.db
      .prepare(
        `SELECT roles.name
         FROM roles
         INNER JOIN user_roles ON user_roles.role_id = roles.id
         WHERE user_roles.user_id = ?
         ORDER BY roles.name`,
      )
      .bind(userId)
      .all<RoleRow>();
    return (result.results ?? []).map((row) => row.name);
  }

  async setUserRoles(userId: string, roleNames: RoleName[]): Promise<void> {
    await this.db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).bind(userId).run();
    for (const roleName of roleNames) {
      const roleId = roleIdFor(roleName);
      await this.db
        .prepare(`INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`)
        .bind(roleId, roleName, null)
        .run();
      await this.db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).bind(userId, roleId).run();
    }
  }

  async listCustomerAccess(userId: string): Promise<CustomerAccessRecord[]> {
    const result = await this.db
      .prepare(`SELECT customer_id, access_level FROM customer_user_access WHERE user_id = ? ORDER BY customer_id`)
      .bind(userId)
      .all<CustomerAccessRow>();
    return (result.results ?? []).map((row) => ({ customerId: row.customer_id, accessLevel: row.access_level }));
  }

  async setCustomerAccess(userId: string, access: CustomerAccessRecord[]): Promise<void> {
    await this.db.prepare(`DELETE FROM customer_user_access WHERE user_id = ?`).bind(userId).run();
    for (const record of access) {
      await this.db
        .prepare(`INSERT INTO customer_user_access (customer_id, user_id, access_level) VALUES (?, ?, ?)`)
        .bind(record.customerId, userId, record.accessLevel)
        .run();
    }
  }

  async createSession(session: AuthSessionRecord): Promise<void> {
    await this.db
      .prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(session.id, session.userId, session.tokenHash, session.expiresAt, session.revokedAt)
      .run();
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const row = await this.db
      .prepare(`SELECT id, user_id, token_hash, expires_at, revoked_at FROM sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<SessionRow>();
    return row
      ? { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: row.expires_at, revokedAt: row.revoked_at }
      : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.prepare(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(sessionId).run();
  }
}

export function roleIdFor(roleName: RoleName) {
  return `role_${roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function mapUser(row: UserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    userType: row.user_type,
    passwordHash: row.password_hash,
    isActive: row.is_active === 1,
  };
}

