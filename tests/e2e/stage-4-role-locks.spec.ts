import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminEmail = "stage4-e2e-admin@example.com";
const adminPassword = "Stage4E2E123!";
const fallbackAdmins = [
  { email: "stage3-e2e-admin@example.com", password: "Stage3E2E123!" },
  { email: "stage2-e2e-admin@example.com", password: "Stage2E2E123!" },
  { email: "inventory-e2e-admin@example.com", password: "InventoryE2E123!" },
];
const salesEmail = "stage4-e2e-sales@example.com";
const salesPassword = "Stage4Sales123!";

type ApiEnvelope<T> = { ok: boolean; data: T };

async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((options.headers as Record<string, string> | undefined) || {}),
    },
  });
  const raw = await response.text();
  expect(response.ok(), `${path} returned ${response.status()}: ${raw}`).toBe(true);
  const body = JSON.parse(raw) as ApiEnvelope<T>;
  expect(body.ok).toBe(true);
  return body.data;
}

async function tryLogin(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/login", { data: { email, password } });
  if (!response.ok()) return null;
  const body = (await response.json()) as ApiEnvelope<{ token: string }>;
  return body.ok ? body.data.token : null;
}

async function ensureAdmin(request: APIRequestContext) {
  const setupStatus = await apiJson<{ needsSetup: boolean }>(request, "/api/auth/setup-status");
  if (setupStatus.needsSetup) {
    await apiJson(request, "/api/auth/setup", {
      method: "POST",
      data: {
        email: adminEmail,
        password: adminPassword,
        displayName: "Stage 4 E2E Admin",
      },
    });
  }

  const token = await tryLogin(request, adminEmail, adminPassword);
  if (token) return token;

  for (const fallback of fallbackAdmins) {
    const fallbackToken = await tryLogin(request, fallback.email, fallback.password);
    if (fallbackToken) return fallbackToken;
  }

  expect(token, "Need an existing E2E admin to create the Stage 4 Sales user").toBeTruthy();
  return token as string;
}

async function ensureSalesUser(request: APIRequestContext, adminToken: string) {
  const created = await request.post("/api/users", {
    headers: { authorization: `Bearer ${adminToken}` },
    data: {
      email: salesEmail,
      displayName: "Stage 4 E2E Sales",
      password: salesPassword,
      roles: ["Sales"],
    },
  });
  expect([200, 400], `Stage 4 sales setup returned ${created.status()}`).toContain(created.status());

  const token = await tryLogin(request, salesEmail, salesPassword);
  expect(token, "Stage 4 sales login should work").toBeTruthy();
  return token as string;
}

async function loginInBrowser(page: Page) {
  await page.getByLabel("Email").fill(salesEmail);
  await page.getByLabel("Password").fill(salesPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /Stage 4 E2E Sales/ })).toBeVisible();
}

test("Stage 4 Sales role cannot access Production/Warehousing shipping UI or API", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const adminToken = await ensureAdmin(request);
  const salesToken = await ensureSalesUser(request, adminToken);

  const blockedShipping = await request.get("/api/shipping/queue", {
    headers: { authorization: `Bearer ${salesToken}` },
  });
  expect(blockedShipping.status()).toBe(403);

  await page.goto("/");
  await loginInBrowser(page);

  await expect(page.locator("#nav a[data-page='shipping']")).toBeHidden();
  await expect(page.getByRole("button", { name: /^Shipping$/ })).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as { router: (page: string) => void }).router("shipping");
  });

  await expect(page.locator("#content").getByText("Restricted area").first()).toBeVisible();
  await expect(page.locator("#content").getByText("Shipping").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Allowed Area/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
