import { expect, test, type APIRequestContext } from "@playwright/test";

const adminEmail = "inventory-e2e-admin@example.com";
const adminPassword = "InventoryE2E123!";
const warehouseEmail = "inventory-e2e-warehouse@example.com";
const warehousePassword = "InventoryE2E123!";

type ApiEnvelope<T> = { ok: boolean; data: T };
type MasterItemSeed = { id: string; name: string };
type InventoryItemSeed = { id: string };

async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {}
) {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((options.headers as Record<string, string> | undefined) || {}),
    },
  });
  expect(response.ok(), `${path} returned ${response.status()}`).toBe(true);
  const body = await response.json() as ApiEnvelope<T>;
  expect(body.ok).toBe(true);
  return body.data;
}

async function apiFetchJson(request: APIRequestContext, path: string, options: Parameters<APIRequestContext["fetch"]>[1] = {}) {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((options.headers as Record<string, string> | undefined) || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

async function ensureEmployeeUser(request: APIRequestContext, authHeaders: Record<string, string>) {
  const payload = {
    email: warehouseEmail,
    displayName: "Inventory E2E Warehouse",
    password: warehousePassword,
    roles: ["Warehousing"],
  };
  const created = await request.post("/api/users", {
    headers: authHeaders,
    data: payload,
  });
  if (created.ok()) return;
  expect([400, 409], "Non-admin employee user setup should either create or already exist").toContain(created.status());

  const users = await apiJson<Array<{ id: string; email: string }>>(request, "/api/users", { headers: authHeaders });
  const existing = users.find((user) => user.email === warehouseEmail);
  expect(existing, "Existing non-admin employee user should be visible to Admin").toBeTruthy();
  const updated = await request.patch(`/api/users/${existing?.id}`, {
    headers: authHeaders,
    data: {
      displayName: payload.displayName,
      temporaryPassword: warehousePassword,
      roles: payload.roles,
    },
  });
  expect(updated.ok(), `Non-admin employee user reset returned ${updated.status()}`).toBe(true);
}

async function createMasterItem(request: APIRequestContext, authHeaders: Record<string, string>, label: string, runSuffix: string) {
  const displayName = `E2E ${label} ${runSuffix}`;
  const skuSuffix = `${label}-${runSuffix}`.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  return apiJson<MasterItemSeed>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku: `E2E-${skuSuffix}`,
      name: displayName,
      itemType: "raw_material",
      unitOfMeasure: "lb",
      customerId: "general",
      allergens: [],
    },
  });
}

async function createInventoryItem(
  request: APIRequestContext,
  authHeaders: Record<string, string>,
  masterItemId: string,
  suffix: string,
  onHandQuantity: number,
  allocatedQuantity = 0,
) {
  return apiJson<InventoryItemSeed>(request, "/api/inventory", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId,
      category: "Ingredient",
      supplierId: null,
      customerId: "general",
      onHandQuantity,
      allocatedQuantity,
      reorderPointQuantity: 10,
      unitOfMeasure: "lb",
      unitCostCents: 100,
      leadTimeDays: 3,
      location: `E2E-${suffix}`,
      lotNumber: `E2E-LOT-${suffix}`,
      lotsJson: JSON.stringify([{ lotNumber: `E2E-LOT-${suffix}`, location: `E2E-${suffix}`, qty: onHandQuantity }]),
    },
  });
}

test("Inventory hardening flows use backend archive, COA, and reasoned adjustment behavior", async ({ page, request }) => {
  test.setTimeout(150_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const expectedBlockedArchiveError = text.includes("status of 409");
    if (message.type() === "error" && !expectedBlockedArchiveError) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const setupStatus = await apiJson<{ needsSetup: boolean }>(request, "/api/auth/setup-status");
  if (setupStatus.needsSetup) {
    await apiJson(request, "/api/auth/setup", {
      method: "POST",
      data: { email: adminEmail, password: adminPassword, displayName: "Inventory E2E Admin" },
    });
  }
  const login = await apiJson<{ token: string }>(request, "/api/auth/login", {
    method: "POST",
    data: { email: adminEmail, password: adminPassword },
  });
  const authHeaders = { authorization: `Bearer ${login.token}` };
  await ensureEmployeeUser(request, authHeaders);
  const runSuffix = Date.now().toString(36);
  const archiveMasterName = `E2E Archive Master ${runSuffix}`;
  const stockedName = `E2E Stocked Ingredient ${runSuffix}`;
  const zeroName = `E2E Zero Ingredient ${runSuffix}`;

  const archiveMaster = await apiJson<{ id: string }>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku: `E2E-ARCHIVE-MASTER-${runSuffix}`.toUpperCase(),
      name: archiveMasterName,
      itemType: "raw_material",
      unitOfMeasure: "lb",
      customerId: "general",
      allergens: [],
    },
  });
  const stockedMaster = await apiJson<{ id: string }>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku: `E2E-STOCKED-MASTER-${runSuffix}`.toUpperCase(),
      name: stockedName,
      itemType: "raw_material",
      unitOfMeasure: "lb",
      customerId: "general",
      allergens: [],
    },
  });
  const zeroMaster = await apiJson<{ id: string }>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku: `E2E-ZERO-MASTER-${runSuffix}`.toUpperCase(),
      name: zeroName,
      itemType: "raw_material",
      unitOfMeasure: "lb",
      customerId: "general",
      allergens: [],
    },
  });

  const stockedItem = await apiJson<{ id: string }>(request, "/api/inventory", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: stockedMaster.id,
      category: "Ingredient",
      supplierId: null,
      customerId: "general",
      onHandQuantity: 45,
      allocatedQuantity: 0,
      reorderPointQuantity: 10,
      unitOfMeasure: "lb",
      unitCostCents: 100,
      leadTimeDays: 3,
      location: "E2E-A1",
      lotNumber: "E2E-LOT-A",
      lotsJson: JSON.stringify([{ lotNumber: "E2E-LOT-A", location: "E2E-A1", qty: 45 }]),
    },
  });
  const zeroItem = await apiJson<{ id: string }>(request, "/api/inventory", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: zeroMaster.id,
      category: "Ingredient",
      supplierId: null,
      customerId: "general",
      onHandQuantity: 0,
      allocatedQuantity: 0,
      reorderPointQuantity: 10,
      unitOfMeasure: "lb",
      unitCostCents: 100,
      leadTimeDays: 3,
      location: "E2E-Z1",
      lotNumber: "E2E-LOT-Z",
      lotsJson: JSON.stringify([{ lotNumber: "E2E-LOT-Z", location: "E2E-Z1", qty: 0 }]),
    },
  });
  const allocatedMaster = await createMasterItem(request, authHeaders, "Allocated Blocked Ingredient", runSuffix);
  const allocatedItem = await createInventoryItem(request, authHeaders, allocatedMaster.id, "ALLOC", 8, 3);
  const forceMaster = await createMasterItem(request, authHeaders, "Force Archive Ingredient", runSuffix);
  const forceItem = await createInventoryItem(request, authHeaders, forceMaster.id, "FORCE", 12, 0);
  const reservationMaster = await createMasterItem(request, authHeaders, "Reservation Blocked Ingredient", runSuffix);
  const reservationItem = await createInventoryItem(request, authHeaders, reservationMaster.id, "RES", 5, 0);
  const reservationCustomer = await apiJson<{ id: string }>(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: `E2E Reservation Customer ${runSuffix}`,
      contactName: "E2E Ops",
      contactEmail: `e2e-reservation-${runSuffix}@example.com`,
      phone: "555-0100",
    },
  });
  const reservationPO = await apiJson<{ lines: Array<{ id: string }> }>(request, "/api/purchase-orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      poNumber: `E2E-RESERVATION-PO-${runSuffix}`.toUpperCase(),
      customerId: reservationCustomer.id,
      requestedShipDate: "2026-07-15",
      lines: [{ description: "E2E reserved ingredient", quantity: 2, unitOfMeasure: "lb", masterItemId: reservationMaster.id }],
    },
  });

  const allocatedArchive = await apiFetchJson(request, `/api/inventory/${allocatedItem.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  expect(allocatedArchive.response.status(), "Allocated items should be blocked with exact details").toBe(409);
  expect(allocatedArchive.body).toMatchObject({
    error: {
      code: "INVENTORY_ITEM_ARCHIVE_BLOCKED",
      details: {
        itemName: allocatedMaster.name,
        blockers: expect.arrayContaining([
          expect.objectContaining({ field: "onHandQuantity", value: 8, unit: "lb" }),
          expect.objectContaining({ field: "allocatedQuantity", value: 3, unit: "lb" }),
        ]),
      },
    },
  });

  await apiJson(request, `/api/inventory/${reservationItem.id}/reservations`, {
    method: "POST",
    headers: authHeaders,
    data: { purchaseOrderLineId: reservationPO.lines[0].id, quantity: 2 },
  });
  const reservationArchive = await apiFetchJson(request, `/api/inventory/${reservationItem.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  expect(reservationArchive.response.status(), "Reserved items should be blocked with reservation details").toBe(409);
  expect(reservationArchive.body).toMatchObject({
    error: {
      code: "INVENTORY_ITEM_ARCHIVE_BLOCKED",
      details: {
        itemName: reservationMaster.name,
        blockers: expect.arrayContaining([
          expect.objectContaining({ field: "onHandQuantity", value: 5, unit: "lb" }),
          expect.objectContaining({ field: "activeReservations", value: 1 }),
        ]),
      },
    },
  });

  const nonAdminLogin = await apiJson<{ token: string }>(request, "/api/auth/login", {
    method: "POST",
    data: { email: warehouseEmail, password: warehousePassword },
  });
  const nonAdminForce = await apiFetchJson(request, `/api/inventory/${forceItem.id}?force=true`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${nonAdminLogin.token}` },
  });
  expect(nonAdminForce.response.status(), "Non-admin force archive should be forbidden").toBe(403);
  expect(nonAdminForce.body).toMatchObject({
    error: {
      code: "FORBIDDEN",
      message: "Only Admin can force delete Inventory items",
    },
  });

  const uploadResponse = await request.post("/api/files", {
    headers: authHeaders,
    multipart: {
      ownerType: "inventory_item",
      ownerId: stockedItem.id,
      fileCategory: "inventory_coa",
      file: {
        name: "e2e-coa.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% E2E COA\n"),
      },
    },
  });
  expect(uploadResponse.ok(), `COA upload returned ${uploadResponse.status()}`).toBe(true);
  const uploadBody = await uploadResponse.json() as ApiEnvelope<{ id: string }>;

  await page.goto("/");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  const inventoryNav = page.locator('[data-page="inventory"]');
  await expect(inventoryNav).toBeVisible();
  await inventoryNav.click();
  await page.getByRole("button", { name: /Ingredients/ }).click();
  await expect(page.getByText(stockedName)).toBeVisible();

  await page.getByRole("button", { name: /Master List/ }).click();
  await expect(page.getByText(archiveMasterName)).toBeVisible();
  await page.locator("tr", { hasText: archiveMasterName }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Archive Master Item" }).click();
  await expect(page.getByText("Master item archived.")).toBeVisible();
  await expect(page.locator("tr", { hasText: archiveMasterName })).toHaveCount(0);

  await page.getByRole("button", { name: /Ingredients/ }).click();
  const stockedRow = page.locator("tr", { hasText: stockedName });
  await expect(stockedRow).toBeVisible();
  const coaButton = stockedRow.getByRole("button", { name: /CoA/ });
  await expect(coaButton).toBeVisible();
  const [coaResponse, coaRequest] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/files/${uploadBody.data.id}/download`) &&
      response.ok()
    ),
    page.waitForRequest((fileRequest) =>
      fileRequest.method() === "GET" && fileRequest.url().includes(`/api/files/${uploadBody.data.id}/download`)
    ),
    coaButton.click(),
  ]);
  expect(coaResponse.ok()).toBe(true);
  expect(coaRequest.headers().authorization).toMatch(/^Bearer /);

  await stockedRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Archive Item" }).click();
  await expect(page.getByRole("dialog", { name: "Force archive inventory item" })).toBeVisible();
  await expect(page.getByText(`On hand of ${stockedName} is still 45 lb.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Force Archive" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(stockedRow).toBeVisible();

  const forceRow = page.locator("tr", { hasText: forceMaster.name });
  await expect(forceRow).toBeVisible();
  await forceRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Archive Item" }).click();
  await expect(page.getByText(`On hand of ${forceMaster.name} is still 12 lb.`)).toBeVisible();
  await page.getByRole("button", { name: "Force Archive" }).click();
  await expect(page.getByText("Inventory item archived.")).toBeVisible();
  await expect(page.locator("tr", { hasText: forceMaster.name })).toHaveCount(0);

  const forcedRead = await request.patch(`/api/inventory/${forceItem.id}`, {
    headers: authHeaders,
    data: { onHandQuantity: 12 },
  });
  expect(forcedRead.status(), "Force-archived inventory items should not remain editable").toBe(404);

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByLabel("Email").fill(warehouseEmail);
  await page.getByLabel("Password").fill(warehousePassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-page="inventory"]')).toBeVisible();
  await page.locator('[data-page="inventory"]').click();
  await page.getByRole("button", { name: /Ingredients/ }).click();
  const allocatedRow = page.locator("tr", { hasText: allocatedMaster.name });
  await expect(allocatedRow).toBeVisible();
  await allocatedRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Archive Item" }).click();
  await expect(page.getByRole("dialog", { name: "Archive blocked" })).toBeVisible();
  await expect(page.getByText(`Allocated quantity of ${allocatedMaster.name} is still 3 lb.`)).toBeVisible();
  await expect(page.getByText("Only Admin can force delete this Inventory item.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Force Archive" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(allocatedRow).toBeVisible();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-page="inventory"]')).toBeVisible();
  await page.locator('[data-page="inventory"]').click();
  await page.getByRole("button", { name: /Ingredients/ }).click();

  const adjustmentRequest = page.waitForRequest((request) =>
    request.method() === "POST" &&
    request.url().includes(`/api/inventory/${stockedItem.id}/adjustments`) &&
    request.postData()?.includes("Cycle count correction") === true &&
    request.postData()?.includes("E2E count verified") === true
  );
  await stockedRow.getByRole("button", { name: "Adjust" }).click();
  await page.locator("#adj_qty_0").fill("33");
  await page.locator("#adj_reason").selectOption("Cycle count correction");
  await page.locator("#adj_note").fill("E2E count verified");
  await page.getByRole("button", { name: "Apply" }).click();
  await adjustmentRequest;
  await expect(page.getByText("Stock updated in backend.")).toBeVisible();
  await expect(page.locator("tr", { hasText: stockedName }).getByRole("cell", { name: "33", exact: true })).toBeVisible();

  const zeroRow = page.locator("tr", { hasText: zeroName });
  await expect(zeroRow).toBeVisible();
  await zeroRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Archive Item" }).click();
  await expect(page.getByText("Inventory item archived.")).toBeVisible();
  await expect(page.locator("tr", { hasText: zeroName })).toHaveCount(0);

  const zeroRead = await request.patch(`/api/inventory/${zeroItem.id}`, {
    headers: authHeaders,
    data: { onHandQuantity: 0 },
  });
  expect(zeroRead.status(), "Archived inventory items should not remain editable through active inventory PATCH").toBe(404);

  expect(consoleErrors).toEqual([]);
});
