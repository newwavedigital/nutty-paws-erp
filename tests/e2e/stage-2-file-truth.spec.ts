import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminEmail = "stage2-e2e-admin@example.com";
const adminPassword = "Stage2E2E123!";

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

async function tryLogin(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", {
    data: { email: adminEmail, password: adminPassword },
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
        displayName: "Stage 2 E2E Admin",
      },
    });
  }

  const existing = await tryLogin(request);
  if (existing) return existing;

  const fallback = await request.post("/api/auth/login", {
    data: { email: "truth-e2e-admin@example.com", password: "TruthE2E123!" },
  });
  expect(fallback.ok(), "Need an existing local E2E admin to create the Stage 2 admin").toBe(true);
  const fallbackBody = (await fallback.json()) as ApiEnvelope<{ token: string }>;
  const created = await request.post("/api/users", {
    headers: { authorization: `Bearer ${fallbackBody.data.token}` },
    data: {
      email: adminEmail,
      displayName: "Stage 2 E2E Admin",
      password: adminPassword,
      roles: ["Admin"],
    },
  });
  expect([200, 400], `Stage 2 admin setup returned ${created.status()}`).toContain(created.status());

  const token = await tryLogin(request);
  expect(token, "Stage 2 admin login should work after setup").toBeTruthy();
  return token as string;
}

async function loginInBrowser(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /Stage 2 E2E Admin/ })).toBeVisible();
}

async function uploadPurchaseOrderFile(
  request: APIRequestContext,
  authHeaders: Record<string, string>,
  purchaseOrderId: string,
  fileCategory: "coa" | "shipment_document",
  fileName: string,
  contents: string,
) {
  const response = await request.post("/api/files", {
    headers: authHeaders,
    multipart: {
      ownerType: "purchase_order",
      ownerId: purchaseOrderId,
      fileCategory,
      file: {
        name: fileName,
        mimeType: "application/pdf",
        buffer: Buffer.from(contents),
      },
    },
  });
  expect(response.ok(), `Upload ${fileName} returned ${response.status()}`).toBe(true);
  return ((await response.json()) as ApiEnvelope<{ id: string; fileName: string }>).data;
}

async function seedShippingPurchaseOrder(request: APIRequestContext, authHeaders: Record<string, string>, suffix: string) {
  const customer = await apiJson<{ id: string }>(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: `Stage 2 File Customer ${suffix}`,
      contactName: "Stage 2 QA",
      contactEmail: `stage2-${suffix}@example.com`,
      phone: "555-0202",
    },
  });

  const product = await apiJson<{ id: string }>(request, "/api/products", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      sku: `STAGE2-FILE-${suffix}`.toUpperCase(),
      name: `Stage 2 File Product ${suffix}`,
      status: "active",
      size: 12,
      sizeUnit: "oz",
      caseQuantity: 12,
      unitPriceCents: 499,
      bomItems: [],
    },
  });

  const po = await apiJson<{ id: string; poNumber: string; lines: Array<{ id: string }> }>(request, "/api/purchase-orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      poNumber: `STAGE2-FILE-${suffix}`.toUpperCase(),
      customerId: customer.id,
      requestedShipDate: "2026-07-10",
      lines: [{ productId: product.id, quantity: 24, unitOfMeasure: "Each" }],
    },
  });

  await apiJson(request, `/api/purchase-orders/${po.id}/submit`, { method: "POST", headers: authHeaders, data: {} });
  await apiJson(request, `/api/purchase-orders/${po.id}/lines/${po.lines[0].id}/supply-chain-review`, {
    method: "POST",
    headers: authHeaders,
    data: { supplyChainStatus: "available" },
  });
  await apiJson(request, `/api/purchase-orders/${po.id}/approve-for-production`, { method: "POST", headers: authHeaders, data: {} });
  const run = await apiJson<{ id: string }>(request, "/api/production/schedule", {
    method: "POST",
    headers: authHeaders,
    data: {
      purchaseOrderId: po.id,
      productionDate: "2026-07-03",
      productionEndDate: "2026-07-03",
      productionRoom: "E2E Room",
    },
  });
  await apiJson(request, `/api/production/runs/${run.id}/finalize`, {
    method: "POST",
    headers: authHeaders,
    data: {
      lines: [{
        purchaseOrderLineId: po.lines[0].id,
        productId: product.id,
        quantityProduced: 24,
        casesProduced: 2,
        lotNumber: `STAGE2-LOT-${suffix}`,
      }],
      materialActuals: [],
    },
  });
  const releaseCoa = await uploadPurchaseOrderFile(
    request,
    authHeaders,
    po.id,
    "coa",
    `release-coa-${suffix}.pdf`,
    "%PDF-1.4\nrelease coa\n",
  );
  await apiJson(request, `/api/quality/purchase-orders/${po.id}/release`, {
    method: "POST",
    headers: authHeaders,
    data: { coaFileId: releaseCoa.id, notes: "Stage 2 release seed" },
  });

  return po;
}

test("Stage 2 file truth survives browser upload, reload, and authenticated download", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const expectedForcedUploadFailure = message.text().includes("Failed to load resource") && message.text().includes("status of 500");
    if (message.type() === "error" && !expectedForcedUploadFailure) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const token = await ensureAdmin(request);
  const authHeaders = { authorization: `Bearer ${token}` };
  const suffix = Date.now().toString(36);
  const po = await seedShippingPurchaseOrder(request, authHeaders, suffix);
  const olderShipmentDocument = await uploadPurchaseOrderFile(
    request,
    authHeaders,
    po.id,
    "shipment_document",
    `older-shipment-doc-${suffix}.pdf`,
    "%PDF-1.4\nolder shipment doc\n",
  );

  await loginInBrowser(page);

  const purchaseOrdersLoad = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    response.url().includes("/api/purchase-orders") &&
    response.ok()
  );
  await page.getByRole("button", { name: /Purchase Orders/ }).click();
  await purchaseOrdersLoad;
  await page.getByRole("button", { name: /Quality Assurance/ }).click();
  await expect(page.getByText(po.poNumber)).toBeVisible();
  const postShipmentInput = page.locator(`input[onchange*="qualityPostShipmentCoaSelected"][onchange*="${po.poNumber}"]`);
  await expect(postShipmentInput).toBeAttached();
  const postShipmentRequest = page.waitForRequest((req) =>
    req.method() === "POST" &&
    req.url().includes(`/api/quality/purchase-orders/${po.id}/post-shipment-coa`) &&
    req.postData()?.includes("coaFileId") === true
  );
  await postShipmentInput.setInputFiles({
    name: `post-shipment-${suffix}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\npost shipment coa\n"),
  });
  await postShipmentRequest;
  await expect(page.getByText("Post-shipment COA attached.")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`post-shipment-${suffix}\\.pdf`) })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /Stage 2 E2E Admin/ })).toBeVisible();
  const reloadedPurchaseOrdersLoad = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    response.url().includes("/api/purchase-orders") &&
    response.ok()
  );
  await page.getByRole("button", { name: /Purchase Orders/ }).click();
  await reloadedPurchaseOrdersLoad;
  await page.getByRole("button", { name: /Quality Assurance/ }).click();
  const reloadedPostShipment = page.getByRole("button", { name: new RegExp(`post-shipment-${suffix}\\.pdf`) });
  await expect(reloadedPostShipment).toBeVisible();
  const postShipmentFileId = await reloadedPostShipment.getAttribute("data-backend-file-id");
  expect(postShipmentFileId).toBeTruthy();
  const [postShipmentDownload, postShipmentDownloadRequest] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/files/${postShipmentFileId}/download`) &&
      response.ok()
    ),
    page.waitForRequest((req) =>
      req.method() === "GET" && req.url().includes(`/api/files/${postShipmentFileId}/download`)
    ),
    reloadedPostShipment.click(),
  ]);
  expect(postShipmentDownload.ok()).toBe(true);
  expect(postShipmentDownloadRequest.headers().authorization).toMatch(/^Bearer /);

  await page.getByRole("button", { name: /Shipping/ }).click();
  await expect(page.getByText(po.poNumber)).toBeVisible();
  const shippingCard = page.locator(".card", { hasText: po.poNumber }).first();
  await expect(shippingCard.getByText("Required to ship")).toBeVisible();
  await expect(shippingCard.getByRole("button", { name: "Download" })).toHaveCount(0);
  await shippingCard.locator(`input[id^="sh_docs_input_"]`).setInputFiles({
    name: `shipment-doc-${suffix}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nshipment doc\n"),
  });
  await expect(page.getByText("Shipment document selected. Save or mark shipped to upload it to the backend.")).toBeVisible();
  await expect(shippingCard.locator(".badge", { hasText: "Pending upload" })).toBeVisible();
  await expect(shippingCard.getByRole("button", { name: "Download" })).toHaveCount(0);

  await page.route("**/api/files", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Forced Stage 2 upload failure" } }),
      });
      return;
    }
    await route.continue();
  });
  await shippingCard.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Forced Stage 2 upload failure|Backend write failed|Shipping info could not be saved/i)).toBeVisible();
  await expect(shippingCard.locator(".badge", { hasText: "Pending upload" })).toBeVisible();
  await expect(shippingCard.getByText("Uploaded")).toHaveCount(0);
  await expect(shippingCard.getByRole("button", { name: "Download" })).toHaveCount(0);
  await page.unroute("**/api/files");

  const uploadRequest = page.waitForRequest((req) =>
    req.method() === "POST" && req.url().endsWith("/api/files")
  );
  const detailsRequest = page.waitForRequest((req) =>
    req.method() === "PATCH" &&
    req.url().includes(`/api/shipping/purchase-orders/${po.id}/details`) &&
    req.postData()?.includes("shipmentDocumentFileId") === true
  );
  await shippingCard.getByRole("button", { name: "Save" }).click();
  await uploadRequest;
  await detailsRequest;
  await expect(page.getByText(`Shipping info saved to backend for ${po.poNumber}.`)).toBeVisible();
  await expect(shippingCard.getByText("Uploaded")).toBeVisible();
  await expect(shippingCard.getByRole("button", { name: "Download" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /Stage 2 E2E Admin/ })).toBeVisible();
  await page.getByRole("button", { name: /Shipping/ }).click();
  const reloadedShippingCard = page.locator(".card", { hasText: po.poNumber }).first();
  await expect(reloadedShippingCard.getByText("Uploaded")).toBeVisible();
  const shippingDownloadButton = reloadedShippingCard.getByRole("button", { name: "Download" });
  await expect(shippingDownloadButton).toBeVisible();
  const shipmentDocumentFileId = await shippingDownloadButton.getAttribute("data-backend-file-id");
  expect(shipmentDocumentFileId).toBeTruthy();
  expect(shipmentDocumentFileId).not.toBe(olderShipmentDocument.id);
  const [shipmentDownload, shipmentDownloadRequest] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/files/${shipmentDocumentFileId}/download`) &&
      response.ok()
    ),
    page.waitForRequest((req) =>
      req.method() === "GET" && req.url().includes(`/api/files/${shipmentDocumentFileId}/download`)
    ),
    shippingDownloadButton.click(),
  ]);
  expect(shipmentDownload.ok()).toBe(true);
  expect(shipmentDownloadRequest.headers().authorization).toMatch(/^Bearer /);

  expect(consoleErrors).toEqual([]);
});
