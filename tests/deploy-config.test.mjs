import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonc, validateDeployConfig } from "../scripts/validate-deploy-config.mjs";

const wranglerConfig = parseJsonc(readFileSync(resolve(__dirname, "..", "wrangler.jsonc"), "utf8"));

describe("deploy config guard", () => {
  it("allows the current staging demo config to keep auth disabled", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "false",
      },
    });

    expect(errors).toEqual([]);
  });

  it("rejects a production-like top-level config with auth disabled", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "production",
        AUTH_REQUIRED: "false",
      },
    });

    expect(errors).toEqual([
      'top-level is production-like but AUTH_REQUIRED is not exactly "true"',
    ]);
  });

  it("rejects a production environment without explicit auth-on config", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "false",
      },
      env: {
        production: {
          vars: {
            ENVIRONMENT: "production",
          },
        },
      },
    });

    expect(errors).toEqual([
      'production is production-like but AUTH_REQUIRED is not exactly "true"',
    ]);
  });

  it("allows an explicit production env with auth enabled", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "true",
      },
      env: {
        production: {
          vars: {
            ENVIRONMENT: "production",
            AUTH_REQUIRED: "true",
          },
        },
      },
    });

    expect(errors).toEqual([]);
  });

  it("requires only non-secret submitted-PO SendGrid config when enabled", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "true",
        SENDGRID_SUBMITTED_PO_ENABLED: "true",
        SUBMITTED_PO_NOTIFICATION_TO: "supply@example.com",
        SUBMITTED_PO_NOTIFICATION_FROM: "erp@example.com",
        SUBMITTED_PO_NOTIFICATION_CC: "owner@example.com, ops@example.com",
      },
    });

    expect(errors).toEqual([]);
  });

  it("rejects enabled submitted-PO SendGrid config without from or to values", () => {
    const errors = validateDeployConfig({
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "true",
        SENDGRID_SUBMITTED_PO_ENABLED: "true",
        SUBMITTED_PO_NOTIFICATION_TO: "   ",
      },
    });

    expect(errors).toEqual([
      'top-level enables submitted-PO SendGrid but SUBMITTED_PO_NOTIFICATION_TO is missing',
      'top-level enables submitted-PO SendGrid but SUBMITTED_PO_NOTIFICATION_FROM is missing',
    ]);
  });

  it("parses jsonc comments and BOMs without changing string values", () => {
    const parsed = parseJsonc(`\uFEFF{
      // staging review stays auth-off
      "vars": {
        "ENVIRONMENT": "staging",
        "NOTE": "https://example.com/path//still-string"
      }
    }`);

    expect(parsed.vars.NOTE).toBe("https://example.com/path//still-string");
  });

  it("pins the staging default config and explicit production env split", () => {
    expect(wranglerConfig).toMatchObject({
      name: "nut-house-portal-staging",
      main: "src/index.ts",
      compatibility_date: "2026-06-09",
      compatibility_flags: ["nodejs_compat"],
      observability: {
        enabled: true,
        head_sampling_rate: 1,
      },
      vars: {
        ENVIRONMENT: "staging",
        AUTH_REQUIRED: "true",
        APP_VERSION: "1.0.0-staging.1",
      },
      assets: {
        directory: "./public",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*"],
      },
      d1_databases: [
        {
          binding: "DB",
          database_name: "nut-house-portal-staging-db",
          migrations_dir: "migrations",
        },
      ],
      r2_buckets: [
        {
          binding: "FILES",
          bucket_name: "nut-house-staging-files",
        },
      ],
      env: {
        production: {
          name: "nut-house-portal",
          vars: {
            ENVIRONMENT: "production",
            AUTH_REQUIRED: "true",
            APP_VERSION: "1.0.0",
          },
          d1_databases: [
            {
              binding: "DB",
              database_name: "nut-house-portal-db",
              database_id: "2fe7ce2c-5699-4594-8a63-a111e118f443",
              migrations_dir: "migrations",
            },
          ],
          r2_buckets: [
            {
              binding: "FILES",
              bucket_name: "nut-house-files",
            },
          ],
        },
      },
    });
    expect(wranglerConfig.routes).toBeUndefined();
    expect(wranglerConfig.vars?.SENDGRID_SUBMITTED_PO_ENABLED).toBe("false");
    expect(wranglerConfig.vars?.SUBMITTED_PO_NOTIFICATION_TO).toBe("generalmalit07@gmail.com");
    expect(wranglerConfig.vars?.SUBMITTED_PO_NOTIFICATION_FROM).toBe("no-reply@nuthouseportal.com");
    expect(wranglerConfig.vars?.SENDGRID_API_KEY).toBeUndefined();
    expect(wranglerConfig.env?.production?.vars?.SENDGRID_SUBMITTED_PO_ENABLED).toBeUndefined();
    expect(wranglerConfig.env?.production?.vars?.SUBMITTED_PO_NOTIFICATION_TO).toBeUndefined();
    expect(wranglerConfig.env?.production?.vars?.SUBMITTED_PO_NOTIFICATION_FROM).toBeUndefined();
    expect(wranglerConfig.env?.production?.vars?.SENDGRID_API_KEY).toBeUndefined();
  });
});
