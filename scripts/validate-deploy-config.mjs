import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

export function validateDeployConfig(config) {
  const errors = [];
  const rootVars = config?.vars ?? {};
  const environments = [{ name: "top-level", vars: rootVars, config, topLevel: true }];

  for (const [name, envConfig] of Object.entries(config?.env ?? {})) {
    environments.push({ name, vars: envConfig?.vars ?? {}, config: envConfig, topLevel: false });
  }

  for (const environment of environments) {
    const environmentName = String(environment.vars.ENVIRONMENT ?? environment.name ?? "").toLowerCase();
    const productionLike =
      environmentName === "production" ||
      environmentName === "prod" ||
      environmentName === "live" ||
      environment.name === "production" ||
      environment.name === "prod";

    validateSubmittedPONotifications(environment, errors);
    validateKnownWorkerBindings(environment, environmentName, errors);

    if (!productionLike) continue;

    if (environment.vars.AUTH_REQUIRED !== "true") {
      errors.push(
        `${environment.name} is production-like but AUTH_REQUIRED is not exactly "true"`,
      );
    }
  }

  return errors;
}

function validateKnownWorkerBindings(environment, environmentName, errors) {
  const workerName = String(environment.config?.name ?? "");

  if (environment.topLevel && workerName === "nut-house-portal-staging") {
    errors.push("top-level deploy target must not be the staging Worker");
  }

  if (workerName === "nut-house-portal") {
    validateExpectedBinding(environment, environmentName, "production", "nut-house-portal-db", "2fe7ce2c-5699-4594-8a63-a111e118f443", "nut-house-files", errors);
  }

  if (workerName === "nut-house-portal-staging") {
    validateExpectedBinding(environment, environmentName, "staging", "nut-house-portal-staging-db", "57fd07a6-97d1-42c8-9f7f-e62b6e1f78b1", "nut-house-staging-files", errors);
  }
}

function validateExpectedBinding(environment, environmentName, expectedEnvironment, expectedDatabaseName, expectedDatabaseId, expectedBucketName, errors) {
  const label = environment.name;
  const db = findBinding(environment.config?.d1_databases, "DB");
  const bucket = findBinding(environment.config?.r2_buckets, "FILES");

  if (environmentName !== expectedEnvironment) {
    errors.push(`${label} Worker binding ENVIRONMENT must be "${expectedEnvironment}"`);
  }

  if (db?.database_name !== expectedDatabaseName) {
    errors.push(`${label} Worker DB binding must be ${expectedDatabaseName}`);
  }

  if (db?.database_id !== expectedDatabaseId) {
    errors.push(`${label} Worker DB id must be ${expectedDatabaseId}`);
  }

  if (bucket?.bucket_name !== expectedBucketName) {
    errors.push(`${label} Worker R2 binding must be ${expectedBucketName}`);
  }
}

function findBinding(bindings, bindingName) {
  if (!Array.isArray(bindings)) return null;
  return bindings.find((binding) => binding?.binding === bindingName) ?? null;
}

function validateSubmittedPONotifications(environment, errors) {
  if (environment.vars.SENDGRID_SUBMITTED_PO_ENABLED !== "true") {
    return;
  }

  if (!requiredString(environment.vars.SUBMITTED_PO_NOTIFICATION_TO)) {
    errors.push(
      `${environment.name} enables submitted-PO SendGrid but SUBMITTED_PO_NOTIFICATION_TO is missing`,
    );
  }

  if (!requiredString(environment.vars.SUBMITTED_PO_NOTIFICATION_FROM)) {
    errors.push(
      `${environment.name} enables submitted-PO SendGrid but SUBMITTED_PO_NOTIFICATION_FROM is missing`,
    );
  }
}

function requiredString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseJsonc(input) {
  return JSON.parse(stripJsonComments(input.replace(/^\uFEFF/, "")));
}

export function validateConfigFile(path = "wrangler.jsonc") {
  const resolvedPath = resolve(path);
  const config = parseJsonc(readFileSync(resolvedPath, "utf8"));
  return validateDeployConfig(config);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  const errors = validateConfigFile(process.argv[2] ?? "wrangler.jsonc");
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Deploy config guard passed.");
  }
}
