import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminEmail = "stage3-e2e-admin@example.com";
const adminPassword = "Stage3E2E123!";
const fallbackAdminEmail = "stage2-e2e-admin@example.com";
const fallbackAdminPassword = "Stage2E2E123!";

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
  const response = await request.post("/api/auth/login", {
    data: { email, password },
  });
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
        displayName: "Stage 3 E2E Admin",
      },
    });
  }

  const existing = await tryLogin(request, adminEmail, adminPassword);
  if (existing) return existing;

  const fallback = await tryLogin(request, fallbackAdminEmail, fallbackAdminPassword);
  expect(fallback, "Need an existing admin to create the Stage 3 E2E admin").toBeTruthy();
  const created = await request.post("/api/users", {
    headers: { authorization: `Bearer ${fallback}` },
    data: {
      email: adminEmail,
      displayName: "Stage 3 E2E Admin",
      password: adminPassword,
      roles: ["Admin"],
    },
  });
  expect([200, 400], `Stage 3 admin setup returned ${created.status()}`).toContain(created.status());

  const token = await tryLogin(request, adminEmail, adminPassword);
  expect(token, "Stage 3 admin login should work after setup").toBeTruthy();
  return token as string;
}

async function seedStaleLocalState(page: Page) {
  await page.evaluate(() => {
    const staleCustomer = {
      id: "stage3_local_customer",
      name: "Stage 3 Local Customer",
      contact: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      pickPackEligible: true,
    };
    const staleState = {
      customers: [staleCustomer],
      ingredients: [{
        id: "stage3_local_fg",
        name: "Stage 3 Local Finished Good",
        category: "Finished Good",
        customerId: staleCustomer.id,
        stock: 24,
        unit: "ea",
        lots: [{ lotNumber: "STAGE3-LOCAL-LOT", location: "LOCAL", qty: 24 }],
      }],
      purchaseOrders: [{
        id: "STAGE3-LOCAL-PO",
        brand: "Local Browser Brand",
        customerId: staleCustomer.id,
        poDate: "2026-07-03",
        requestedDate: "2026-07-10",
        requestedShipDate: "2026-07-10",
        status: "pending",
        poFile: null,
        depositStatus: "not_required",
        lines: [{ productId: "stage3_local_product", qty: 12, price: 1, description: "Local-only PO line" }],
      }],
      pickPackOrders: [{
        id: "PP-STAGE3-LOCAL",
        customerId: staleCustomer.id,
        poNumber: "STAGE3-LOCAL-PICK",
        dateSubmitted: "2026-07-03",
        dateNeededToShip: "2026-07-10",
        status: "open",
        poFile: null,
        lines: [{ ingredientId: "stage3_local_fg", inventoryItemId: "stage3_local_fg", qty: 2 }],
      }, {
        id: "PP-STAGE3-SHIP",
        customerId: staleCustomer.id,
        poNumber: "STAGE3-LOCAL-SHIP",
        dateSubmitted: "2026-07-03",
        dateNeededToShip: "2026-07-10",
        status: "picked",
        pickedAt: "2026-07-03T00:00:00.000Z",
        shippingMode: "pallet",
        poFile: null,
        lines: [{ ingredientId: "stage3_local_fg", inventoryItemId: "stage3_local_fg", qty: 2 }],
      }],
    };
    const appState = eval("state") as {
      customers: unknown[];
      ingredients: unknown[];
      purchaseOrders: unknown[];
      pickPackOrders: unknown[];
    };
    const poBackendState = eval("backendApiState") as { loadedPurchaseOrders: boolean; loadingPurchaseOrders: boolean };
    const pickBackendState = eval("backendPickPackState") as { loaded: boolean; loading: boolean };
    appState.customers = staleState.customers;
    appState.ingredients = staleState.ingredients;
    appState.purchaseOrders = staleState.purchaseOrders;
    appState.pickPackOrders = staleState.pickPackOrders;
    poBackendState.loadedPurchaseOrders = false;
    poBackendState.loadingPurchaseOrders = false;
    pickBackendState.loaded = false;
    pickBackendState.loading = false;
    localStorage.setItem("nuttypaws_erp_v1", JSON.stringify(staleState));
    localStorage.removeItem("nuttypaws_erp_v1_backend_cache_v1");
  });
}

async function loginInBrowser(page: Page) {
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /Stage 3 E2E Admin/ })).toBeVisible();
}

test("Stage 3 stale local rows cannot impersonate backend records in signed-in mode", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await ensureAdmin(request);
  await page.goto("/");
  await loginInBrowser(page);
  await seedStaleLocalState(page);
  await expect.poll(async () =>
    page.evaluate(() => (eval("state") as { purchaseOrders: Array<{ id: string }> }).purchaseOrders.map((po) => po.id))
  ).toContain("STAGE3-LOCAL-PO");

  const purchaseOrdersLoad = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    response.url().includes("/api/purchase-orders") &&
    response.ok()
  );
  await page.getByRole("button", { name: /Purchase Orders/ }).click();
  await purchaseOrdersLoad;
  const stalePoRow = page.locator("tr", { hasText: "STAGE3-LOCAL-PO" });
  await expect(stalePoRow).toBeVisible();
  await expect(stalePoRow.getByText("Local draft")).toBeVisible();
  await expect(stalePoRow.getByText("Backend required")).toBeVisible();
  await expect(stalePoRow.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(stalePoRow.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(stalePoRow.locator('[title="Not saved to backend"]')).toHaveCount(1);

  const pickPackLoad = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    response.url().includes("/api/pick-pack/orders") &&
    response.ok()
  );
  await page.getByRole("button", { name: /Pick & Pack/ }).click();
  await pickPackLoad;
  const stalePickRow = page.locator("tr", { hasText: "STAGE3-LOCAL-PICK" });
  await expect(stalePickRow).toBeVisible();
  await expect(stalePickRow.getByText("Local draft")).toBeVisible();
  await expect(stalePickRow.getByText("Backend required")).toBeVisible();
  await expect(stalePickRow.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(stalePickRow.getByRole("button", { name: /Mark Picked/ })).toHaveCount(0);
  await expect(stalePickRow.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Shipping/ }).click();
  const staleShippingCard = page.locator(".card", { hasText: "STAGE3-LOCAL-SHIP" }).first();
  await expect(staleShippingCard).toBeVisible();
  await expect(staleShippingCard.locator('[title="Not saved to backend"]').getByText("Local draft")).toBeVisible();
  await expect(staleShippingCard.getByText("Not saved to backend.")).toBeVisible();
  await expect(staleShippingCard.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(staleShippingCard.getByRole("button", { name: /Mark Shipped/ })).toBeDisabled();

  expect(consoleErrors).toEqual([]);
});
