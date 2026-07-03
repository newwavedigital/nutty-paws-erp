import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const adminEmail = "messy-gate-admin@example.com";
const adminPassword = "MessyGate123!";
const salesEmail = "messy-gate-sales@example.com";
const salesPassword = "MessySales123!";
const fallbackAdmins = [
  { email: "stage2-e2e-admin@example.com", password: "Stage2E2E123!" },
  { email: "truth-e2e-admin@example.com", password: "TruthE2E123!" },
  { email: "inventory-e2e-admin@example.com", password: "InventoryE2E123!" },
];
const sharedE2EAdmins = [
  { email: "inventory-e2e-admin@example.com", password: "InventoryE2E123!", displayName: "Inventory E2E Admin" },
  { email: "truth-e2e-admin@example.com", password: "TruthE2E123!", displayName: "Truth E2E Admin" },
  { email: "stage2-e2e-admin@example.com", password: "Stage2E2E123!", displayName: "Stage 2 E2E Admin" },
  { email: "stage3-e2e-admin@example.com", password: "Stage3E2E123!", displayName: "Stage 3 E2E Admin" },
  { email: "stage4-e2e-admin@example.com", password: "Stage4E2E123!", displayName: "Stage 4 E2E Admin" },
];

type ApiEnvelope<T> = { ok: boolean; data: T };
type ErrorEnvelope = { ok: false; error: { code: string; message: string } };
type Headers = Record<string, string>;

async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((options.headers as Headers | undefined) || {}),
    },
  });
  const raw = await response.text();
  expect(response.ok(), `${path} returned ${response.status()}: ${raw}`).toBe(true);
  const body = JSON.parse(raw) as ApiEnvelope<T>;
  expect(body.ok).toBe(true);
  return body.data;
}

async function fetchJson(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const response = await request.fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...((options.headers as Headers | undefined) || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

async function expectApiError(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1],
  expectedStatuses: number[],
  expectedCode?: string,
) {
  const { response, body } = await fetchJson(request, path, options);
  expect(expectedStatuses, `${path} returned ${response.status()}: ${JSON.stringify(body)}`).toContain(response.status());
  expect((body as ErrorEnvelope).ok).toBe(false);
  if (expectedCode) expect((body as ErrorEnvelope).error.code).toBe(expectedCode);
  return body as ErrorEnvelope;
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
      data: { email: adminEmail, password: adminPassword, displayName: "Messy Gate Admin" },
    });
  }

  const existing = await tryLogin(request, adminEmail, adminPassword);
  if (existing) {
    await ensureSharedE2EAdmins(request, { authorization: `Bearer ${existing}` });
    return existing;
  }

  let fallbackToken: string | null = null;
  for (const fallback of fallbackAdmins) {
    fallbackToken = await tryLogin(request, fallback.email, fallback.password);
    if (fallbackToken) break;
  }
  expect(fallbackToken, "Need an existing E2E admin or empty setup DB for messy gate").toBeTruthy();
  const fallbackHeaders = { authorization: `Bearer ${fallbackToken}` };
  const created = await request.post("/api/users", {
    headers: fallbackHeaders,
    data: {
      email: adminEmail,
      displayName: "Messy Gate Admin",
      password: adminPassword,
      roles: ["Admin"],
    },
  });
  expect([200, 400, 409], `messy admin setup returned ${created.status()}`).toContain(created.status());

  const users = await apiJson<Array<{ id: string; email: string }>>(request, "/api/users", { headers: fallbackHeaders });
  const admin = users.find((user) => user.email === adminEmail);
  if (admin) {
    await request.patch(`/api/users/${admin.id}`, {
      headers: fallbackHeaders,
      data: { displayName: "Messy Gate Admin", temporaryPassword: adminPassword, roles: ["Admin"] },
    });
  }

  const token = await tryLogin(request, adminEmail, adminPassword);
  expect(token, "messy admin login should work").toBeTruthy();
  await ensureSharedE2EAdmins(request, { authorization: `Bearer ${token}` });
  return token as string;
}

async function ensureSharedE2EAdmins(request: APIRequestContext, adminHeaders: Headers) {
  for (const admin of sharedE2EAdmins) {
    const created = await request.post("/api/users", {
      headers: adminHeaders,
      data: {
        email: admin.email,
        displayName: admin.displayName,
        password: admin.password,
        roles: ["Admin"],
      },
    });
    expect([200, 400, 409], `shared admin ${admin.email} setup returned ${created.status()}`).toContain(created.status());
  }

  const users = await apiJson<Array<{ id: string; email: string }>>(request, "/api/users", { headers: adminHeaders });
  for (const admin of sharedE2EAdmins) {
    const user = users.find((candidate) => candidate.email === admin.email);
    expect(user, `shared admin ${admin.email} should exist`).toBeTruthy();
    await request.patch(`/api/users/${user?.id}`, {
      headers: adminHeaders,
      data: { displayName: admin.displayName, temporaryPassword: admin.password, roles: ["Admin"] },
    });
  }
}

async function ensureSalesUser(request: APIRequestContext, adminHeaders: Headers) {
  const created = await request.post("/api/users", {
    headers: adminHeaders,
    data: {
      email: salesEmail,
      displayName: "Messy Gate Sales",
      password: salesPassword,
      roles: ["Sales"],
    },
  });
  expect([200, 400, 409], `messy sales setup returned ${created.status()}`).toContain(created.status());

  const users = await apiJson<Array<{ id: string; email: string }>>(request, "/api/users", { headers: adminHeaders });
  const sales = users.find((user) => user.email === salesEmail);
  expect(sales, "messy sales user should be visible").toBeTruthy();
  await request.patch(`/api/users/${sales?.id}`, {
    headers: adminHeaders,
    data: { displayName: "Messy Gate Sales", temporaryPassword: salesPassword, roles: ["Sales"] },
  });

  const token = await tryLogin(request, salesEmail, salesPassword);
  expect(token, "messy sales login should work").toBeTruthy();
  return token as string;
}

async function uploadFile(
  request: APIRequestContext,
  authHeaders: Headers,
  ownerType: string,
  ownerId: string,
  fileCategory: string,
  fileName: string,
  contents: string,
) {
  const response = await request.post("/api/files", {
    headers: authHeaders,
    multipart: {
      ownerType,
      ownerId,
      fileCategory,
      file: {
        name: fileName,
        mimeType: "application/pdf",
        buffer: Buffer.from(contents),
      },
    },
  });
  const raw = await response.text();
  expect(response.ok(), `upload ${fileName} returned ${response.status()}: ${raw}`).toBe(true);
  return (JSON.parse(raw) as ApiEnvelope<{ id: string; fileName: string }>).data;
}

async function seedCustomerProduct(request: APIRequestContext, authHeaders: Headers, suffix: string) {
  const customer = await apiJson<{ id: string; name: string }>(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: `Messy Customer ${suffix}`,
      contactName: "Messy Ops",
      contactEmail: `messy-${suffix}@example.com`,
      phone: "555-0700",
    },
  });
  const productSku = `MESSY-PROD-${suffix}`.toUpperCase();
  const product = await apiJson<{ id: string; sku: string }>(request, "/api/products", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      sku: productSku,
      name: `Messy Product ${suffix}`,
      status: "active",
      size: 12,
      sizeUnit: "oz",
      caseQuantity: 12,
      unitPriceCents: 599,
      bomItems: [],
    },
  });
  return { customer, product };
}

async function seedPurchaseOrder(request: APIRequestContext, authHeaders: Headers, suffix: string) {
  const { customer, product } = await seedCustomerProduct(request, authHeaders, suffix);
  const po = await apiJson<{ id: string; poNumber: string; status: string; lines: Array<{ id: string; productId: string }> }>(
    request,
    "/api/purchase-orders",
    {
      method: "POST",
      headers: authHeaders,
      data: {
        poNumber: `MESSY-PO-${suffix}`.toUpperCase(),
        customerId: customer.id,
        requestedShipDate: "2026-07-10",
        notes: "initial messy order",
        lines: [{ productId: product.id, quantity: 24, unitOfMeasure: "Each" }],
      },
    },
  );
  return { customer, product, po };
}

async function seedMasterInventory(
  request: APIRequestContext,
  authHeaders: Headers,
  suffix: string,
  itemType: "raw_material" | "finished_good" = "raw_material",
  customerId = "general",
) {
  const sku = `MESSY-${itemType === "finished_good" ? "FG" : "RAW"}-${suffix}`.toUpperCase();
  const master = await apiJson<{ id: string; sku: string; name: string }>(request, "/api/master-items", {
    method: "POST",
    headers: authHeaders,
    data: {
      sku,
      name: `Messy ${itemType === "finished_good" ? "Finished Good" : "Raw"} ${suffix}`,
      itemType,
      unitOfMeasure: itemType === "finished_good" ? "ea" : "lb",
      customerId,
      allergens: [],
    },
  });
  const inventory = await apiJson<{ id: string }>(request, "/api/inventory", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: master.id,
      category: itemType === "finished_good" ? "Finished Good" : "Ingredient",
      supplierId: null,
      customerId,
      onHandQuantity: 20,
      allocatedQuantity: 0,
      reorderPointQuantity: 5,
      unitOfMeasure: itemType === "finished_good" ? "ea" : "lb",
      unitCostCents: 100,
      leadTimeDays: 3,
      location: `MESSY-${suffix}`,
      lotNumber: `MESSY-LOT-${suffix}`,
      lotsJson: JSON.stringify([{ lotNumber: `MESSY-LOT-${suffix}`, location: `MESSY-${suffix}`, qty: 20 }]),
    },
  });
  return { master, inventory };
}

test("dirty duplicate and weird input cases fail as stable API errors, not fake success", async ({ request }) => {
  test.setTimeout(120_000);
  const token = await ensureAdmin(request);
  const authHeaders = { authorization: `Bearer ${token}` };
  const suffix = Date.now().toString(36);

  const customer = await apiJson<{ id: string; name: string; contactEmail: string }>(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: `  Messy Trim Customer ${suffix}  `,
      contactName: "  Padded Person  ",
      contactEmail: `  trim-${suffix}@example.com  `,
      phone: " 555-0701 ",
    },
  });
  expect(customer.name).toBe(`Messy Trim Customer ${suffix}`);
  expect(customer.contactEmail).toBe(`trim-${suffix}@example.com`);

  await expectApiError(request, "/api/customers", {
    method: "POST",
    headers: authHeaders,
    data: {
      name: customer.name,
      contactName: "Duplicate",
      contactEmail: `duplicate-${suffix}@example.com`,
      phone: "555-0702",
    },
  }, [409], "DUPLICATE_RECORD");

  const product = await apiJson<{ id: string; sku: string }>(request, "/api/products", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      sku: ` MESSY-DUP-SKU-${suffix} `,
      name: `Messy Duplicate SKU ${suffix}`,
      status: "active",
      bomItems: [],
    },
  });
  expect(product.sku).toBe(`MESSY-DUP-SKU-${suffix}`);
  await expectApiError(request, "/api/products", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      sku: product.sku,
      name: `Messy Duplicate SKU Again ${suffix}`,
      status: "active",
      bomItems: [],
    },
  }, [409], "DUPLICATE_RECORD");

  const po = await apiJson<{ id: string; poNumber: string }>(request, "/api/purchase-orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      poNumber: ` MESSY-DUP-PO-${suffix} `,
      customerId: customer.id,
      requestedShipDate: "2026-07-12",
      lines: [{ productId: product.id, quantity: 12, unitOfMeasure: "Each" }],
    },
  });
  expect(po.poNumber).toBe(`MESSY-DUP-PO-${suffix}`);
  await expectApiError(request, "/api/purchase-orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      poNumber: po.poNumber,
      customerId: customer.id,
      requestedShipDate: "2026-07-12",
      lines: [{ productId: product.id, quantity: 12, unitOfMeasure: "Each" }],
    },
  }, [409], "PO_NUMBER_ALREADY_EXISTS");

  await expectApiError(request, "/api/purchase-orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      poNumber: `MESSY-BAD-QTY-${suffix}`,
      customerId: customer.id,
      requestedShipDate: "2026-07-12",
      lines: [{ productId: product.id, quantity: -1, unitOfMeasure: "Each" }],
    },
  }, [400], "INVALID_QUANTITY");
});

test("backtracking and status boundaries reject stale actions after submit, cancel, receive, archive, and pick-pack changes", async ({ request }) => {
  test.setTimeout(180_000);
  const token = await ensureAdmin(request);
  const authHeaders = { authorization: `Bearer ${token}` };
  const suffix = Date.now().toString(36);

  const { customer, po } = await seedPurchaseOrder(request, authHeaders, `${suffix}-po`);
  const patchedDraft = await apiJson<{ notes: string; requestedShipDate: string }>(request, `/api/purchase-orders/${po.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { notes: "corrected before submit", requestedShipDate: "2026-07-14", lines: [{ quantity: 999 }] },
  });
  expect(patchedDraft).toMatchObject({ notes: "corrected before submit", requestedShipDate: "2026-07-14" });

  const submitted = await apiJson<{ status: string }>(request, `/api/purchase-orders/${po.id}/submit`, {
    method: "POST",
    headers: authHeaders,
    data: {},
  });
  expect(submitted.status).toBe("supply_chain_review");
  await expectApiError(request, `/api/purchase-orders/${po.id}/submit`, {
    method: "POST",
    headers: authHeaders,
    data: {},
  }, [409], "INVALID_STATUS_TRANSITION");

  const cancelled = await apiJson<{ status: string }>(request, `/api/purchase-orders/${po.id}/cancel`, {
    method: "POST",
    headers: authHeaders,
    data: {},
  });
  expect(cancelled.status).toBe("cancelled");
  await expectApiError(request, `/api/purchase-orders/${po.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { notes: "stale browser tries to edit cancelled PO", requestedShipDate: "2026-07-20" },
  }, [409], "PO_LOCKED_FOR_PRODUCTION");
  await expectApiError(request, `/api/purchase-orders/${po.id}/lines/${po.lines[0].id}/supply-chain-review`, {
    method: "POST",
    headers: authHeaders,
    data: { supplyChainStatus: "available" },
  }, [409], "SUPPLY_CHAIN_REVIEW_LOCKED");

  const { master, inventory } = await seedMasterInventory(request, authHeaders, `${suffix}-inv`);
  const receiving = await apiJson<{ id: string; receivingId: string; totalQuantity: number }>(request, "/api/inventory/receiving", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: master.id,
      inventoryItemId: inventory.id,
      itemName: master.name,
      date: "2026-07-04",
      time: "09:00",
      packages: 2,
      quantityPerPackage: 5,
      unitOfMeasure: "lb",
      lotNumber: `RCV-${suffix}`,
      allergens: [],
      receivedBy: "Messy Tester",
      carrier: "Corrected Carrier",
    },
  });
  expect(receiving.totalQuantity).toBe(10);
  const correctedReceiving = await apiJson<{ totalQuantity: number }>(request, `/api/inventory/receiving/${receiving.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { packages: 3, quantityPerPackage: 4, carrier: "Corrected Again" },
  });
  expect(correctedReceiving.totalQuantity).toBe(12);
  await apiJson(request, `/api/inventory/receiving/${receiving.id}`, { method: "DELETE", headers: authHeaders });
  await expectApiError(request, `/api/inventory/receiving/${receiving.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { carrier: "stale edit after archive" },
  }, [409], "RECEIVING_ENTRY_ARCHIVED");

  const receiving2 = await apiJson<{ id: string; receivingId: string }>(request, "/api/inventory/receiving", {
    method: "POST",
    headers: authHeaders,
    data: {
      masterItemId: master.id,
      inventoryItemId: inventory.id,
      itemName: master.name,
      date: "2026-07-04",
      time: "10:00",
      packages: 1,
      quantityPerPackage: 6,
      unitOfMeasure: "lb",
      lotNumber: `MOVE-${suffix}`,
      allergens: [],
    },
  });
  const move = await apiJson<{ id: string; quantityMoved: number }>(request, "/api/inventory/moves", {
    method: "POST",
    headers: authHeaders,
    data: {
      receivingId: receiving2.receivingId,
      date: "2026-07-04",
      time: "11:00",
      caseCount: 1,
      quantityPerCase: 3,
      fromLocation: "Dock",
      toLocation: "A1",
    },
  });
  expect(move.quantityMoved).toBe(3);
  await apiJson(request, `/api/inventory/moves/${move.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { caseCount: 2, quantityPerCase: 2, toLocation: "B1" },
  });
  await apiJson(request, `/api/inventory/moves/${move.id}`, { method: "DELETE", headers: authHeaders });
  await expectApiError(request, `/api/inventory/moves/${move.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { toLocation: "stale move edit" },
  }, [409], "MOVE_ENTRY_ARCHIVED");

  const procurement = await apiJson<{ id: string; status: string; lines: Array<{ id: string }> }>(request, "/api/procurement/orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      supplierNameSnapshot: "Messy Supplier",
      expectedDate: "2026-07-20",
      rows: [{
        inventoryItemId: inventory.id,
        masterItemId: master.id,
        name: master.name,
        onHandQuantity: 0,
        allocatedQuantity: 0,
        netAvailableQuantity: 0,
        reorderPointQuantity: 5,
        shortageQuantity: 5,
        suggestedQuantity: 10,
        unitOfMeasure: "lb",
        reason: "low_stock",
      }],
    },
  });
  await apiJson(request, `/api/procurement/orders/${procurement.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { quickBooksPoNumber: `QB-${suffix}`, expectedDate: "2026-07-21", notes: "corrected before cancel" },
  });
  await apiJson(request, `/api/procurement/orders/${procurement.id}/cancel`, { method: "POST", headers: authHeaders, data: {} });
  await expectApiError(request, `/api/procurement/orders/${procurement.id}/receive`, {
    method: "POST",
    headers: authHeaders,
    data: { receiptDate: "2026-07-22", lines: [{ procurementOrderLineId: procurement.lines[0].id, receivedQuantity: 1 }] },
  }, [409], "INVALID_PROCUREMENT_STATUS");

  const procurement2 = await apiJson<{ id: string; status: string; lines: Array<{ id: string; quantity: number; quantityReceived: number }> }>(
    request,
    "/api/procurement/orders",
    {
      method: "POST",
      headers: authHeaders,
      data: {
        supplierNameSnapshot: "Messy Supplier Two",
        rows: [{
          inventoryItemId: inventory.id,
          masterItemId: master.id,
          name: master.name,
          onHandQuantity: 0,
          allocatedQuantity: 0,
          netAvailableQuantity: 0,
          reorderPointQuantity: 5,
          shortageQuantity: 5,
          suggestedQuantity: 10,
          unitOfMeasure: "lb",
          reason: "low_stock",
        }],
      },
    },
  );
  await apiJson(request, `/api/procurement/orders/${procurement2.id}/submit`, { method: "POST", headers: authHeaders, data: {} });
  await apiJson(request, `/api/procurement/orders/${procurement2.id}/receive`, {
    method: "POST",
    headers: authHeaders,
    data: { receiptDate: "2026-07-22", lines: [{ procurementOrderLineId: procurement2.lines[0].id, receivedQuantity: 4 }] },
  });
  await expectApiError(request, `/api/procurement/orders/${procurement2.id}/receive`, {
    method: "POST",
    headers: authHeaders,
    data: { receiptDate: "2026-07-23", lines: [{ procurementOrderLineId: procurement2.lines[0].id, receivedQuantity: 99 }] },
  }, [409], "PROCUREMENT_OVER_RECEIPT");

  const pickInventory = await seedMasterInventory(request, authHeaders, `${suffix}-pick`, "finished_good", customer.id);
  const pickOrder = await apiJson<{ id: string; status: string }>(request, "/api/pick-pack/orders", {
    method: "POST",
    headers: authHeaders,
    data: {
      customerId: customer.id,
      customerPoNumber: `MESSY-PICK-${suffix}`,
      dateSubmitted: "2026-07-04",
      dateNeededToShip: "2026-07-12",
      notes: "wrong shipping detail before cancel",
      lines: [{ inventoryItemId: pickInventory.inventory.id, quantity: 2 }],
    },
  });
  await apiJson(request, `/api/pick-pack/orders/${pickOrder.id}/shipping`, {
    method: "PATCH",
    headers: authHeaders,
    data: { shippingMode: "parcel", carrier: "Wrong Carrier", trackingNumber: `WRONG-${suffix}`, weight: 3 },
  });
  await apiJson(request, `/api/pick-pack/orders/${pickOrder.id}/shipping`, {
    method: "PATCH",
    headers: authHeaders,
    data: { shippingMode: "parcel", carrier: "Correct Carrier", trackingNumber: `CORRECT-${suffix}`, weight: 4 },
  });
  await apiJson(request, `/api/pick-pack/orders/${pickOrder.id}/cancel`, { method: "POST", headers: authHeaders, data: {} });
  await expectApiError(request, `/api/pick-pack/orders/${pickOrder.id}/shipping`, {
    method: "PATCH",
    headers: authHeaders,
    data: { shippingMode: "parcel", carrier: "stale edit after cancel" },
  }, [409], "PICK_PACK_ORDER_LOCKED");
  await expectApiError(request, `/api/pick-pack/orders/${pickOrder.id}/mark-picked`, {
    method: "POST",
    headers: authHeaders,
    data: {},
  }, [409], "PICK_PACK_ORDER_LOCKED");
});

test("production, QA, shipping, files, and generic records survive corrections and stale retries", async ({ request }) => {
  test.setTimeout(180_000);
  const token = await ensureAdmin(request);
  const authHeaders = { authorization: `Bearer ${token}` };
  const suffix = Date.now().toString(36);

  const { customer, product, po } = await seedPurchaseOrder(request, authHeaders, `${suffix}-flow`);
  await apiJson(request, `/api/purchase-orders/${po.id}/submit`, { method: "POST", headers: authHeaders, data: {} });
  await apiJson(request, `/api/purchase-orders/${po.id}/lines/${po.lines[0].id}/supply-chain-review`, {
    method: "POST",
    headers: authHeaders,
    data: { supplyChainStatus: "available" },
  });
  await apiJson(request, `/api/purchase-orders/${po.id}/approve-for-production`, { method: "POST", headers: authHeaders, data: {} });

  await expectApiError(request, "/api/production/schedule", {
    method: "POST",
    headers: authHeaders,
    data: {
      purchaseOrderId: po.id,
      productionDate: "2026-07-12",
      productionEndDate: "2026-07-10",
      productionRoom: "Messy Room",
    },
  }, [400], "INVALID_PRODUCTION_DATES");

  const run = await apiJson<{ id: string; status: string; productionRoom: string }>(request, "/api/production/schedule", {
    method: "POST",
    headers: authHeaders,
    data: {
      purchaseOrderId: po.id,
      productionDate: "2026-07-10",
      productionEndDate: "2026-07-10",
      productionRoom: "Wrong Room",
      notes: "wrong room first",
    },
  });
  expect(run.status).toBe("scheduled");
  const correctedRun = await apiJson<{ id: string; productionRoom: string }>(request, `/api/production/runs/${run.id}/schedule`, {
    method: "PATCH",
    headers: authHeaders,
    data: {
      productionDate: "2026-07-11",
      productionEndDate: "2026-07-11",
      productionRoom: "Corrected Room",
      notes: "corrected schedule",
    },
  });
  expect(correctedRun.productionRoom).toBe("Corrected Room");

  const finalized = await apiJson<{ id: string; status: string }>(request, `/api/production/runs/${run.id}/finalize`, {
    method: "POST",
    headers: authHeaders,
    data: {
      lines: [{
        purchaseOrderLineId: po.lines[0].id,
        productId: product.id,
        quantityProduced: 24,
        casesProduced: 2,
        lotNumber: `MESSY-LOT-${suffix}`,
      }],
      materialActuals: [],
      notes: "finalized for messy gate",
    },
  });
  expect(finalized.status).toBe("finalized");
  await expectApiError(request, `/api/production/runs/${run.id}/reopen`, {
    method: "POST",
    headers: authHeaders,
    data: { reason: "   " },
  }, [400], "VALIDATION_ERROR");
  const reopened = await apiJson<{ status: string }>(request, `/api/production/runs/${run.id}/reopen`, {
    method: "POST",
    headers: authHeaders,
    data: { reason: "wrong lot count, correcting before QA" },
  });
  expect(reopened.status).toBe("reopened");
  await apiJson(request, `/api/production/runs/${run.id}/finalize`, {
    method: "POST",
    headers: authHeaders,
    data: {
      lines: [{
        purchaseOrderLineId: po.lines[0].id,
        productId: product.id,
        quantityProduced: 24,
        casesProduced: 2,
        lotNumber: `MESSY-LOT-CORRECTED-${suffix}`,
      }],
      materialActuals: [],
      notes: "corrected finalization",
    },
  });

  await expectApiError(request, `/api/quality/purchase-orders/${po.id}/release`, {
    method: "POST",
    headers: authHeaders,
    data: { coaFileId: "missing-file", notes: "bad file first" },
  }, [409], "COA_REQUIRED");
  const releaseCoa = await uploadFile(request, authHeaders, "purchase_order", po.id, "coa", `messy-release-${suffix}.pdf`, "%PDF-1.4\nrelease\n");
  const released = await apiJson<{ status: string }>(request, `/api/quality/purchase-orders/${po.id}/release`, {
    method: "POST",
    headers: authHeaders,
    data: { coaFileId: releaseCoa.id, notes: "release with correct file" },
  });
  expect(released.status).toBe("shipping");

  const wrongCoa = await uploadFile(request, authHeaders, "purchase_order", po.id, "coa", `messy-wrong-post-${suffix}.pdf`, "%PDF-1.4\nwrong\n");
  const rightCoa = await uploadFile(request, authHeaders, "purchase_order", po.id, "coa", `messy-right-post-${suffix}.pdf`, "%PDF-1.4\nright\n");
  await apiJson(request, `/api/quality/purchase-orders/${po.id}/post-shipment-coa`, {
    method: "POST",
    headers: authHeaders,
    data: { coaFileId: wrongCoa.id },
  });
  const replacedPostCoa = await apiJson<{ postShipmentCoaFileId: string }>(request, `/api/quality/purchase-orders/${po.id}/post-shipment-coa`, {
    method: "POST",
    headers: authHeaders,
    data: { coaFileId: rightCoa.id },
  });
  expect(replacedPostCoa.postShipmentCoaFileId).toBe(rightCoa.id);

  const wrongShippingDoc = await uploadFile(request, authHeaders, "purchase_order", po.id, "shipment_document", `messy-wrong-ship-${suffix}.pdf`, "%PDF-1.4\nwrong ship\n");
  const rightShippingDoc = await uploadFile(request, authHeaders, "purchase_order", po.id, "shipment_document", `messy-right-ship-${suffix}.pdf`, "%PDF-1.4\nright ship\n");
  await apiJson(request, `/api/shipping/purchase-orders/${po.id}/details`, {
    method: "PATCH",
    headers: authHeaders,
    data: { bolNumber: "BOL-WRONG", carrier: "Wrong Carrier", shipmentDocumentFileId: wrongShippingDoc.id },
  });
  const shippingDetails = await apiJson<{ bolNumber: string; carrier: string; shipmentDocumentFileId: string }>(
    request,
    `/api/shipping/purchase-orders/${po.id}/details`,
    {
      method: "PATCH",
      headers: authHeaders,
      data: { bolNumber: "BOL-CORRECT", carrier: "Correct Carrier", shipmentDocumentFileId: rightShippingDoc.id },
    },
  );
  expect(shippingDetails).toMatchObject({
    bolNumber: "BOL-CORRECT",
    carrier: "Correct Carrier",
    shipmentDocumentFileId: rightShippingDoc.id,
  });
  await apiJson(request, `/api/shipping/purchase-orders/${po.id}/mark-shipped`, {
    method: "POST",
    headers: authHeaders,
    data: {
      bolNumber: "BOL-CORRECT",
      carrier: "Correct Carrier",
      shipmentDocumentFileId: rightShippingDoc.id,
      weight: 120,
    },
  });
  await expectApiError(request, `/api/shipping/purchase-orders/${po.id}/details`, {
    method: "PATCH",
    headers: authHeaders,
    data: { bolNumber: 123 },
  }, [400], "VALIDATION_ERROR");

  const contentRecord = await apiJson<{ id: string; title: string; fileIds: string[] }>(request, "/api/content-library", {
    method: "POST",
    headers: authHeaders,
    data: {
      kind: "file",
      title: `Messy Content ${suffix}`,
      payload: { note: "first" },
      fileIds: [rightCoa.id],
    },
  });
  expect(contentRecord.fileIds).toEqual([rightCoa.id]);
  await apiJson(request, `/api/content-library/${contentRecord.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { title: `Messy Content Updated ${suffix}`, payload: { note: "replacement" }, fileIds: [rightShippingDoc.id] },
  });
  await apiJson(request, `/api/content-library/${contentRecord.id}`, { method: "DELETE", headers: authHeaders, data: {} });
  await expectApiError(request, `/api/content-library/${contentRecord.id}`, {
    method: "PATCH",
    headers: authHeaders,
    data: { title: "stale archived content edit" },
  }, [409], "DATA_RECORD_ARCHIVED");
  const archivedRecords = await apiJson<Array<{ id: string; status: string }>>(request, "/api/content-library?status=archived", {
    headers: authHeaders,
  });
  expect(archivedRecords).toEqual(expect.arrayContaining([expect.objectContaining({ id: contentRecord.id, status: "archived" })]));

  const reloginToken = await tryLogin(request, adminEmail, adminPassword);
  expect(reloginToken).toBeTruthy();
  const reloginHeaders = { authorization: `Bearer ${reloginToken}` };
  const reloadedPo = await apiJson<{ id: string; postShipmentCoaFileId: string; status: string }>(request, `/api/purchase-orders/${po.id}`, {
    headers: reloginHeaders,
  });
  expect(reloadedPo).toMatchObject({ id: po.id, postShipmentCoaFileId: rightCoa.id });
});

test("permission UX and stale backend reads are visible in the browser and still enforced by API", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const expectedBlockedFetch = message.text().includes("Failed to load resource") && message.text().includes("status of 503");
    if (message.type() === "error" && !expectedBlockedFetch) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const adminToken = await ensureAdmin(request);
  const adminHeaders = { authorization: `Bearer ${adminToken}` };
  const salesToken = await ensureSalesUser(request, adminHeaders);
  const salesHeaders = { authorization: `Bearer ${salesToken}` };

  const { po } = await seedPurchaseOrder(request, adminHeaders, `${Date.now().toString(36)}-perm`);
  await apiJson(request, `/api/purchase-orders/${po.id}/submit`, { method: "POST", headers: adminHeaders, data: {} });
  await expectApiError(request, `/api/purchase-orders/${po.id}/lines/${po.lines[0].id}/supply-chain-review`, {
    method: "POST",
    headers: salesHeaders,
    data: { supplyChainStatus: "available" },
  }, [403], "FORBIDDEN");
  await expectApiError(request, "/api/shipping/queue", { headers: salesHeaders }, [403], "FORBIDDEN");

  await page.goto("/");
  await page.getByLabel("Email").fill(salesEmail);
  await page.getByLabel("Password").fill(salesPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /Messy Gate Sales/ })).toBeVisible();
  await expect(page.locator("#nav a[data-page='shipping']")).toBeHidden();
  await page.evaluate(() => {
    (window as unknown as { router: (pageName: string) => void }).router("shipping");
  });
  await expect(page.locator("#content").getByText("Restricted area").first()).toBeVisible();

  const baseUrl = new URL(page.url()).origin;
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  adminPage.on("console", (message) => {
    const expectedBlockedFetch = message.text().includes("Failed to load resource") && message.text().includes("status of 503");
    if (message.type() === "error" && !expectedBlockedFetch) consoleErrors.push(message.text());
  });
  adminPage.on("pageerror", (error) => consoleErrors.push(error.message));
  await adminPage.route(/\/api\/content-library(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "FORCED_E2E_BACKEND_DOWN", message: "Forced messy gate backend failure" } }),
      });
      return;
    }
    await route.fallback();
  });

  await adminPage.goto(baseUrl);
  await adminPage.getByLabel("Email").fill(adminEmail);
  await adminPage.getByLabel("Password").fill(adminPassword);
  await adminPage.getByRole("button", { name: /sign in/i }).click();
  await expect(adminPage.getByRole("button", { name: /Messy Gate Admin/ })).toBeVisible();
  const failedContentLoad = adminPage.waitForResponse((response) =>
    response.request().method() === "GET" &&
    /\/api\/content-library(?:\?.*)?$/.test(response.url()) &&
    response.status() === 503
  );
  await adminPage.getByRole("button", { name: /Content Library/ }).click();
  await failedContentLoad;
  await expect(adminPage.getByText("Backend unavailable")).toBeVisible();
  await expect(adminPage.getByText("Forced messy gate backend failure")).toBeVisible();
  await adminContext.close();
  expect(consoleErrors).toEqual([]);
});
