import { describe, expect, it } from "vitest";
import { parseJsonc, validateDeployConfig } from "../scripts/validate-deploy-config.mjs";

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
});
