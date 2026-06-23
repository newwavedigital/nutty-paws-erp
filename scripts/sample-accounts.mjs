import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const SAMPLE_ACCOUNT_ROLES = [
  { role: "Admin", slug: "admin", userType: "employee", displayName: "Admin Demo 1" },
  { role: "Sales", slug: "sales", userType: "employee", displayName: "Sales Demo 1" },
  {
    role: "Supply Chain & Procurement",
    slug: "supply_chain_procurement",
    userType: "employee",
    displayName: "Supply Chain Demo 1",
  },
  { role: "Warehousing", slug: "warehousing", userType: "employee", displayName: "Warehousing Demo 1" },
  { role: "Production", slug: "production", userType: "employee", displayName: "Production Demo 1" },
  { role: "Customer", slug: "customer", userType: "customer", displayName: "Customer Demo 1" },
];

const PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 100000;
const DEFAULT_DATABASE = "nut-house-portal-db";
const SAMPLE_EMAIL_DOMAIN = "staging.nuthouse.local";
const SAMPLE_CUSTOMER_ID = "customer_demo_1";

export function buildSampleAccountEmail(slug) {
  return `${slug}_demo_1@${SAMPLE_EMAIL_DOMAIN}`;
}

export function roleIdFor(roleName) {
  return `role_${roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function hashPassword(password, salt = randomBytes(16)) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Sample account password must be at least 8 characters.");
  }

  const derived = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return [PASSWORD_ALGORITHM, String(PASSWORD_ITERATIONS), salt.toString("base64"), derived.toString("base64")].join("$");
}

export function generateSampleAccountSql(password) {
  const passwordHash = hashPassword(password);
  const lines = [
    "-- Sprint A9 disposable staging sample accounts.",
    "-- Generated locally. Do not commit real passwords or run remotely without approval.",
    `INSERT OR IGNORE INTO customers (id, name, contact_name, contact_email, status)
VALUES ('${SAMPLE_CUSTOMER_ID}', 'Customer Demo 1', 'Customer Demo 1', '${buildSampleAccountEmail("customer")}', 'active');`,
  ];

  for (const account of SAMPLE_ACCOUNT_ROLES) {
    const userId = `user_${account.slug}_demo_1`;
    const roleId = roleIdFor(account.role);
    const email = buildSampleAccountEmail(account.slug);

    lines.push(
      `INSERT OR IGNORE INTO roles (id, name, description)
VALUES ('${roleId}', '${escapeSql(account.role)}', 'Sprint A9 staging sample role');`,
      `INSERT INTO users (id, email, display_name, user_type, password_hash, is_active)
VALUES ('${userId}', '${email}', '${escapeSql(account.displayName)}', '${account.userType}', '${passwordHash}', 1)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  user_type = excluded.user_type,
  password_hash = excluded.password_hash,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;`,
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', '${roleId}');`,
    );

    if (account.role === "Customer") {
      lines.push(
        `INSERT OR REPLACE INTO customer_user_access (customer_id, user_id, access_level)
VALUES ('${SAMPLE_CUSTOMER_ID}', '${userId}', 'manager');`,
      );
    }
  }

  return `${lines.join("\n\n")}\n`;
}

export function sampleAccountSummary() {
  return SAMPLE_ACCOUNT_ROLES.map((account) => ({
    role: account.role,
    email: buildSampleAccountEmail(account.slug),
    userId: `user_${account.slug}_demo_1`,
  }));
}

export function parseArgs(argv) {
  const options = {
    database: DEFAULT_DATABASE,
    execute: false,
    remote: false,
    local: false,
    password: process.env.SAMPLE_ACCOUNT_PASSWORD ?? "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--remote") options.remote = true;
    else if (arg === "--local") options.local = true;
    else if (arg === "--database") options.database = argv[++index] ?? "";
    else if (arg === "--password") options.password = argv[++index] ?? "";
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.local && options.remote) throw new Error("Use either --local or --remote, not both.");
  return options;
}

export function usage() {
  return [
    "Usage: SAMPLE_ACCOUNT_PASSWORD=<password> npm run sample:accounts -- [--execute] [--local|--remote] [--database nut-house-portal-db]",
    "",
    "Default mode prints SQL only. Use --execute only after approval for the target database.",
    "The password is read from SAMPLE_ACCOUNT_PASSWORD or --password and is never printed.",
  ].join("\n");
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const sql = generateSampleAccountSql(options.password);
  console.log("Sprint A9 sample accounts:");
  for (const account of sampleAccountSummary()) {
    console.log(`- ${account.role}: ${account.email}`);
  }

  if (!options.execute) {
    console.log("\nSQL preview:");
    console.log(sql);
    return 0;
  }

  const dir = mkdtempSync(join(tmpdir(), "nut-house-sample-accounts-"));
  const file = join(dir, "sample-accounts.sql");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    const args = ["wrangler", "d1", "execute", options.database, "--file", file];
    if (options.local) args.push("--local");
    if (options.remote) args.push("--remote");
    const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
    return result.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runCli();
}
