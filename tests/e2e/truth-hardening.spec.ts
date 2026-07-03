import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const truthAdminEmail = "truth-e2e-admin@example.com";
const truthAdminPassword = "TruthE2E123!";
const fallbackAdminEmail = "inventory-e2e-admin@example.com";
const fallbackAdminPassword = "InventoryE2E123!";

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
  expect(response.ok(), `${path} returned ${response.status()}`).toBe(true);
  const body = (await response.json()) as ApiEnvelope<T>;
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

async function ensureTruthAdmin(request: APIRequestContext) {
  const setupStatus = await apiJson<{ needsSetup: boolean }>(request, "/api/auth/setup-status");
  if (setupStatus.needsSetup) {
    await apiJson(request, "/api/auth/setup", {
      method: "POST",
      data: {
        email: truthAdminEmail,
        password: truthAdminPassword,
        displayName: "Truth E2E Admin",
      },
    });
  }

  const existingTruthToken = await tryLogin(request, truthAdminEmail, truthAdminPassword);
  if (existingTruthToken) return existingTruthToken;

  const fallbackToken = await tryLogin(request, fallbackAdminEmail, fallbackAdminPassword);
  expect(fallbackToken, "Need either truth admin or inventory fallback admin in the local e2e DB").toBeTruthy();
  const fallbackHeaders = { authorization: `Bearer ${fallbackToken}` };
  const created = await request.post("/api/users", {
    headers: fallbackHeaders,
    data: {
      email: truthAdminEmail,
      displayName: "Truth E2E Admin",
      password: truthAdminPassword,
      roles: ["Admin"],
    },
  });
  expect([200, 400], `Truth admin setup returned ${created.status()}`).toContain(created.status());

  const truthToken = await tryLogin(request, truthAdminEmail, truthAdminPassword);
  expect(truthToken, "Truth admin login should work after setup").toBeTruthy();
  return truthToken as string;
}

async function loginInBrowser(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(truthAdminEmail);
  await page.getByLabel("Password").fill(truthAdminPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /Truth E2E Admin/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Content Library/ })).toBeVisible();
}

async function createDataRecord(
  request: APIRequestContext,
  authHeaders: Record<string, string>,
  path: string,
  kind: string,
  title: string,
  payload: Record<string, unknown>,
) {
  return apiJson<{ id: string }>(request, path, {
    method: "POST",
    headers: authHeaders,
    data: { kind, title, payload, fileIds: Array.isArray(payload.fileIds) ? payload.fileIds : [] },
  });
}

test("truth hardening controls work through actual browser buttons", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const expectedForcedUploadFailure = message.text().includes("Failed to load resource") && message.text().includes("status of 500");
    if (message.type() === "error" && !expectedForcedUploadFailure) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const token = await ensureTruthAdmin(request);
  const authHeaders = { authorization: `Bearer ${token}` };
  const suffix = Date.now().toString(36);

  const libraryTitle = `E2E Protected Library File ${suffix}`;
  const libraryRecord = await createDataRecord(
    request,
    authHeaders,
    "/api/content-library",
    "file",
    libraryTitle,
    {
      id: `lf_${suffix}`,
      kind: "file",
      folderId: null,
      name: `${libraryTitle}.txt`,
      type: "text/plain",
      size: 31,
      uploadedAt: "2026-07-03",
      fileIds: [],
    },
  );
  const libraryUpload = await request.post("/api/files", {
    headers: authHeaders,
    multipart: {
      ownerType: "content_library",
      ownerId: libraryRecord.id,
      fileCategory: "content_library_file",
      file: {
        name: `${libraryTitle}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from("protected content library file"),
      },
    },
  });
  expect(libraryUpload.ok(), `Library upload returned ${libraryUpload.status()}`).toBe(true);
  const libraryFile = (await libraryUpload.json()) as ApiEnvelope<{ id: string }>;
  await apiJson(request, `/api/content-library/${libraryRecord.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: {
      kind: "file",
      title: libraryTitle,
      payload: {
        id: libraryRecord.id,
        kind: "file",
        folderId: null,
        name: `${libraryTitle}.txt`,
        type: "text/plain",
        size: 31,
        uploadedAt: "2026-07-03",
        fileId: libraryFile.data.id,
        fileIds: [libraryFile.data.id],
      },
      fileIds: [libraryFile.data.id],
    },
  });

  const channelTitle = `e2e-truth-${suffix}`;
  await createDataRecord(request, authHeaders, "/api/team-chat", "channel", channelTitle, {
    id: `ch_${suffix}`,
    kind: "channel",
    name: channelTitle,
    description: "Playwright truth hardening channel",
    createdAt: "2026-07-03",
  });
  const seededChannels = await apiJson<Array<{ kind: string; title: string }>>(request, "/api/team-chat", {
    headers: authHeaders,
  });
  expect(seededChannels).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "channel", title: channelTitle })]));

  const customer = await apiJson<{ id: string }>(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: `E2E Pick Customer ${suffix}`,
      contactName: "E2E Pick Ops",
      contactEmail: `pick-${suffix}@example.com`,
      phone: "555-0101",
    },
  });
  const master = await apiJson<{ id: string }>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku: `E2E-FG-${suffix}`.toUpperCase(),
      name: `E2E Pick Finished Good ${suffix}`,
      itemType: "finished_good",
      unitOfMeasure: "ea",
      customerId: customer.id,
      allergens: [],
    },
  });
  const inventoryItem = await apiJson<{ id: string }>(request, "/api/inventory", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: master.id,
      category: "Finished Good",
      supplierId: null,
      customerId: customer.id,
      onHandQuantity: 5,
      allocatedQuantity: 0,
      reorderPointQuantity: 1,
      unitOfMeasure: "ea",
      unitCostCents: 250,
      leadTimeDays: 0,
      location: `E2E-PICK-${suffix}`,
      lotNumber: `E2E-PICK-LOT-${suffix}`,
      lotsJson: JSON.stringify([{ lotNumber: `E2E-PICK-LOT-${suffix}`, location: `E2E-PICK-${suffix}`, qty: 5 }]),
    },
  });
  const pickOrder = await apiJson<{ id: string }>(request, "/api/pick-pack/orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      customerPoNumber: `E2E-PICK-${suffix}`,
      dateSubmitted: "2026-07-03",
      dateNeededToShip: "2026-07-10",
      lines: [{ inventoryItemId: inventoryItem.id, quantity: 2 }],
    },
  });

  await loginInBrowser(page);

  await page.getByRole("button", { name: /Content Library/ }).click();
  const libraryRow = page.locator("tr", { hasText: libraryTitle });
  await expect(libraryRow).toBeVisible();
  const [downloadResponse, capturedDownloadRequest] = await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/files/${libraryFile.data.id}/download`) &&
      response.ok()
    ),
    page.waitForRequest((req) =>
      req.method() === "GET" && req.url().includes(`/api/files/${libraryFile.data.id}/download`)
    ),
    libraryRow.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(downloadResponse.ok()).toBe(true);
  expect(capturedDownloadRequest.headers().authorization).toMatch(/^Bearer /);

  const teamChatLoad = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    response.url().endsWith("/api/team-chat") &&
    response.ok()
  );
  await page.getByRole("button", { name: /Team Chat/ }).click();
  const teamChatResponse = await teamChatLoad;
  const teamChatBody = (await teamChatResponse.json()) as ApiEnvelope<Array<{ kind: string; title: string; payload?: { name?: string } }>>;
  expect(teamChatBody.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "channel", title: channelTitle }),
  ]));
  await expect.poll(async () =>
    page.evaluate((cacheKey) => {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return [];
      return JSON.parse(raw).modules?.a10_team_chat?.records?.map((record: { payload?: { name?: string } }) => record.payload?.name) || [];
    }, "nuttypaws_erp_v1_backend_cache_v1")
  ).toEqual(expect.arrayContaining([channelTitle]));
  await expect(page.getByRole("heading", { name: `# ${channelTitle}` })).toBeVisible();
  const messageText = `Playwright truth message ${suffix}`;
  const messageRequest = page.waitForRequest((req) =>
    req.method() === "POST" &&
    req.url().includes("/api/team-chat") &&
    req.postData()?.includes(messageText) === true
  );
  await page.locator("#chatInput").fill(messageText);
  await page.getByRole("button", { name: "Send" }).click();
  await messageRequest;
  await expect(page.getByText(messageText)).toBeVisible();
  await expect(page.locator(".chat-msg", { hasText: messageText }).getByText("Truth E2E Admin")).toBeVisible();
  await expect(page.locator(".chat-msg", { hasText: messageText }).getByText("Henry")).toHaveCount(0);

  await page.getByRole("button", { name: /Food Safety/ }).click();
  await page.getByRole("button", { name: /Lot Tracking/ }).click();
  await expect(page.getByText("Lot Tracking is read-only for signed-in sessions.")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Lot" })).toBeDisabled();

  await page.getByRole("button", { name: /Pick & Pack/ }).click();
  await expect(page.locator("tr", { hasText: `E2E-PICK-${suffix}` })).toBeVisible();
  const markPickedRequest = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().includes(`/api/pick-pack/orders/${pickOrder.id}/mark-picked`) &&
    response.ok()
  );
  await page.locator("tr", { hasText: `E2E-PICK-${suffix}` }).getByRole("button", { name: /Mark Picked/ }).click();
  await markPickedRequest;
  await expect(page.getByRole("heading", { name: "Picked - Ready to Ship" })).toBeVisible();
  await expect(page.getByText(`PO# E2E-PICK-${suffix}`)).toBeVisible();
  const afterPickInventory = await apiJson<Array<{ id: string; onHandQuantity: number }>>(request, "/api/inventory", {
    headers: authHeaders,
  });
  expect(afterPickInventory.find((item) => item.id === inventoryItem.id)?.onHandQuantity).toBe(3);

  const failedFeedbackTitle = `E2E Failed Feedback ${suffix}`;
  await page.route("**/api/files", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { message: "Forced e2e upload failure" } }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /Feedback/ }).click();
  await page.locator("#fb_name").fill("Truth E2E Admin");
  await page.locator("#fb_email").fill("truth-e2e-admin@example.com");
  await page.locator("#fb_title").fill(failedFeedbackTitle);
  await page.locator("#fb_desc").fill("This upload should fail and clean up the visible record.");
  await page.locator("#fb_file_input").setInputFiles({
    name: "failed-feedback.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("forced failure"),
  });
  const cleanupRequest = page.waitForRequest((req) =>
    req.method() === "DELETE" && req.url().includes("/api/feedback/")
  );
  await page.getByRole("button", { name: "Submit Feedback" }).click();
  await cleanupRequest;
  await expect(page.getByText(/Forced e2e upload failure|File upload failed|Feedback could not be saved/i)).toBeVisible();
  await page.unroute("**/api/files");
  const feedbackRows = await apiJson<Array<{ title: string }>>(request, "/api/feedback", {
    headers: authHeaders,
  });
  expect(feedbackRows.some((row) => row.title === failedFeedbackTitle)).toBe(false);

  expect(consoleErrors).toEqual([]);
});
