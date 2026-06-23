import { describe, expect, it } from "vitest";
import {
  SAMPLE_ACCOUNT_ROLES,
  buildSampleAccountEmail,
  generateSampleAccountSql,
  parseArgs,
  roleIdFor,
  sampleAccountSummary,
} from "../scripts/sample-accounts.mjs";

describe("Sprint A9 sample account generator", () => {
  it("uses the disposable role_demo_1 account naming pattern", () => {
    expect(sampleAccountSummary()).toEqual([
      { role: "Admin", email: "admin_demo_1@staging.nuthouse.local", userId: "user_admin_demo_1" },
      { role: "Sales", email: "sales_demo_1@staging.nuthouse.local", userId: "user_sales_demo_1" },
      {
        role: "Supply Chain & Procurement",
        email: "supply_chain_procurement_demo_1@staging.nuthouse.local",
        userId: "user_supply_chain_procurement_demo_1",
      },
      { role: "Warehousing", email: "warehousing_demo_1@staging.nuthouse.local", userId: "user_warehousing_demo_1" },
      { role: "Production", email: "production_demo_1@staging.nuthouse.local", userId: "user_production_demo_1" },
      { role: "Customer", email: "customer_demo_1@staging.nuthouse.local", userId: "user_customer_demo_1" },
    ]);
    expect(SAMPLE_ACCOUNT_ROLES.map((account) => buildSampleAccountEmail(account.slug))).toContain(
      "customer_demo_1@staging.nuthouse.local",
    );
  });

  it("generates reviewable SQL without printing the raw password", () => {
    const sql = generateSampleAccountSql("shared-secret-123");

    expect(sql).toContain("-- Sprint A9 disposable staging sample accounts.");
    expect(sql).toContain("Customer Demo 1");
    expect(sql).toContain("INSERT OR REPLACE INTO customer_user_access");
    expect(sql).toContain(roleIdFor("Supply Chain & Procurement"));
    expect(sql).toContain("pbkdf2_sha256$100000$");
    expect(sql).not.toContain("shared-secret-123");
  });

  it("requires an explicit password and keeps remote execution opt-in", () => {
    expect(() => generateSampleAccountSql("short")).toThrow("at least 8 characters");
    expect(parseArgs(["--password", "shared-secret-123"])).toMatchObject({
      database: "nut-house-portal-db",
      execute: false,
      remote: false,
      local: false,
      password: "shared-secret-123",
    });
    expect(parseArgs(["--execute", "--remote", "--password", "shared-secret-123"])).toMatchObject({
      execute: true,
      remote: true,
    });
    expect(() => parseArgs(["--local", "--remote"])).toThrow("either --local or --remote");
  });
});
