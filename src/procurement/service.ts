import { ApiError } from "../api/errors";

export type ProcurementOrderStatus = "draft" | "ordered" | "partially_received" | "completed" | "cancelled";
export type NeedToOrderReason = "low_stock" | "net_below_reorder" | "supply_chain_shortage";

export type NeedToOrderInventoryItem = {
  id: string;
  masterItemId: string;
  name: string;
  supplierId: string | null;
  onHandQuantity: number;
  allocatedQuantity: number;
  reorderPointQuantity: number;
  unitOfMeasure: string;
  unitCostCents: number | null;
  leadTimeDays: number | null;
};

export type SupplyChainDemand = {
  inventoryItemId: string;
  purchaseOrderLineId: string;
  requiredQuantity: number;
};

export type NeedToOrderRow = {
  inventoryItemId: string;
  masterItemId: string;
  name: string;
  supplierId: string | null;
  onHandQuantity: number;
  allocatedQuantity: number;
  netAvailableQuantity: number;
  reorderPointQuantity: number;
  shortageQuantity: number;
  suggestedQuantity: number;
  unitOfMeasure: string;
  unitCostCents: number | null;
  leadTimeDays: number | null;
  reason: NeedToOrderReason;
  sourcePurchaseOrderLineId: string | null;
};

export type ProcurementOrderLineRecord = {
  id: string;
  procurementOrderId: string;
  lineNumber: number;
  masterItemId: string;
  inventoryItemId: string | null;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitOfMeasure: string;
  unitCostCents: number | null;
  suggestedQuantity: number;
  sourceReason: NeedToOrderReason;
  sourcePurchaseOrderLineId: string | null;
};

export type ProcurementOrderRecord = {
  id: string;
  procurementOrderNumber: string;
  quickBooksPoNumber: string | null;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  status: ProcurementOrderStatus;
  dateOrdered: string | null;
  expectedDate: string | null;
  receivedDate: string | null;
  notes: string | null;
  lines: ProcurementOrderLineRecord[];
};

export type ProcurementOrderInput = Omit<ProcurementOrderRecord, "lines"> & {
  createdByUserId?: string;
  submittedByUserId?: string;
};

export type ProcurementOrderLineInput = ProcurementOrderLineRecord;

export type ProcurementReceiptTransactionInput = {
  receipt: {
    id: string;
    receiptNumber: string;
    procurementOrderId: string;
    receiptDate: string;
    receivedByUserId?: string;
    isFinal: boolean;
  };
  lines: Array<{
    receiptLineId: string;
    procurementOrderLineId: string;
    inventoryItemId: string | null;
    receivedQuantity: number;
    lotNumber?: string | null;
    location?: string | null;
    finalReceivedQuantity: number;
  }>;
  orderUpdate: {
    id: string;
    status: ProcurementOrderStatus;
    receivedDate?: string | null;
  };
  audit: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  };
};

export type ProcurementDraftTransactionInput = {
  order: ProcurementOrderInput;
  lines: ProcurementOrderLineInput[];
  audit: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  };
};

export type ProcurementInventorySnapshot = {
  id: string;
  onHandQuantity: number;
  lotNumber: string | null;
  location: string | null;
};

export type ProcurementStore = {
  listNeedToOrderRows?(): Promise<NeedToOrderRow[]>;
  nextOrderSequence(): Promise<number>;
  nextReceiptSequence(): Promise<number>;
  createOrder(input: ProcurementOrderInput): Promise<void>;
  createOrderLine(input: ProcurementOrderLineInput): Promise<void>;
  listOrders(): Promise<ProcurementOrderRecord[]>;
  getOrder(id: string): Promise<ProcurementOrderRecord | null>;
  updateOrder(input: {
    id: string;
    status: ProcurementOrderStatus;
    quickBooksPoNumber?: string | null;
    dateOrdered?: string | null;
    expectedDate?: string | null;
    receivedDate?: string | null;
    notes?: string | null;
    submittedByUserId?: string;
  }): Promise<void>;
  updateLineReceivedQuantity(input: { lineId: string; quantityReceived: number }): Promise<void>;
  createReceipt(input: {
    id: string;
    receiptNumber: string;
    procurementOrderId: string;
    receiptDate: string;
    receivedByUserId?: string;
    isFinal: boolean;
  }): Promise<void>;
  createReceiptLine(input: {
    id: string;
    procurementReceiptId: string;
    procurementOrderLineId: string;
    inventoryItemId: string | null;
    receivedQuantity: number;
    lotNumber?: string | null;
    location?: string | null;
  }): Promise<void>;
  getInventoryItem?(inventoryItemId: string): Promise<ProcurementInventorySnapshot | null>;
  restoreInventoryItem?(input: ProcurementInventorySnapshot): Promise<void>;
  deleteReceiptLine?(id: string): Promise<boolean>;
  deleteReceipt?(id: string): Promise<boolean>;
  increaseInventory(input: {
    inventoryItemId: string;
    quantity: number;
    referenceId: string;
    actorUserId?: string;
    lotNumber?: string | null;
    location?: string | null;
  }): Promise<void>;
  receiveOrderTransaction?(input: ProcurementReceiptTransactionInput): Promise<void>;
  createDraftOrderTransaction?(input: ProcurementDraftTransactionInput): Promise<void>;
  createAuditEvent(input: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export class ProcurementError extends ApiError {
  constructor(code: string, message: string) {
    super(code, message, procurementStatusFor(code));
    this.name = "ProcurementError";
  }
}

export function calculateNeedToOrderRows(input: {
  inventoryItems: NeedToOrderInventoryItem[];
  supplyChainDemands: SupplyChainDemand[];
  activeProcurementCoverage: Map<string, number>;
}) {
  const demandByItem = new Map<string, SupplyChainDemand[]>();
  for (const demand of input.supplyChainDemands) {
    const existing = demandByItem.get(demand.inventoryItemId) ?? [];
    existing.push(demand);
    demandByItem.set(demand.inventoryItemId, existing);
  }

  return input.inventoryItems
    .map((item): NeedToOrderRow | null => {
      if ((input.activeProcurementCoverage.get(item.id) ?? 0) > 0) return null;
      const netAvailableQuantity = item.onHandQuantity - item.allocatedQuantity;
      const demands = demandByItem.get(item.id) ?? [];
      const totalDemand = demands.reduce((sum, demand) => sum + demand.requiredQuantity, 0);
      const shortageQuantity = Math.max(0, +(totalDemand - netAvailableQuantity).toFixed(2));
      const sourcePurchaseOrderLineId = demands[0]?.purchaseOrderLineId ?? null;

      let reason: NeedToOrderReason | null = null;
      if (shortageQuantity > 0) reason = "supply_chain_shortage";
      else if (item.onHandQuantity <= item.reorderPointQuantity) reason = "low_stock";
      else if (netAvailableQuantity <= item.reorderPointQuantity) reason = "net_below_reorder";

      if (!reason) return null;

      return {
        inventoryItemId: item.id,
        masterItemId: item.masterItemId,
        name: item.name,
        supplierId: item.supplierId,
        onHandQuantity: item.onHandQuantity,
        allocatedQuantity: item.allocatedQuantity,
        netAvailableQuantity,
        reorderPointQuantity: item.reorderPointQuantity,
        shortageQuantity,
        suggestedQuantity: suggestProcurementQuantity({
          onHandQuantity: item.onHandQuantity,
          reorderPointQuantity: item.reorderPointQuantity,
          shortageQuantity,
        }),
        unitOfMeasure: item.unitOfMeasure,
        unitCostCents: item.unitCostCents,
        leadTimeDays: item.leadTimeDays,
        reason,
        sourcePurchaseOrderLineId,
      };
    })
    .filter((row): row is NeedToOrderRow => Boolean(row));
}

export function suggestProcurementQuantity(input: {
  onHandQuantity: number;
  reorderPointQuantity: number;
  shortageQuantity: number;
}) {
  const reorderFill = Math.max(0, input.reorderPointQuantity * 2 - input.onHandQuantity);
  const shortageFill = input.shortageQuantity > 0 ? input.shortageQuantity + input.reorderPointQuantity : 0;
  return +Math.max(reorderFill, input.reorderPointQuantity, shortageFill).toFixed(2);
}

export async function listNeedToOrderRows(store: ProcurementStore) {
  return store.listNeedToOrderRows?.() ?? [];
}

export async function listProcurementOrders(store: ProcurementStore) {
  return store.listOrders();
}

export async function createDraftProcurementOrder(store: ProcurementStore, input: {
  supplierId?: string | null;
  supplierNameSnapshot?: string | null;
  quickBooksPoNumber?: string | null;
  dateOrdered?: string | null;
  expectedDate?: string | null;
  notes?: string | null;
  actorUserId?: string;
  rows: NeedToOrderRow[];
}) {
  if (input.rows.length === 0) {
    throw new ProcurementError("PROCUREMENT_LINES_REQUIRED", "Procurement order requires at least one line");
  }

  const orderId = `procurement_${crypto.randomUUID()}`;
  const order: ProcurementOrderRecord = {
    id: orderId,
    procurementOrderNumber: `PROC-${await store.nextOrderSequence()}`,
    quickBooksPoNumber: input.quickBooksPoNumber ?? null,
    supplierId: input.supplierId ?? null,
    supplierNameSnapshot: input.supplierNameSnapshot ?? null,
    status: "draft",
    dateOrdered: input.dateOrdered ?? null,
    expectedDate: input.expectedDate ?? null,
    receivedDate: null,
    notes: input.notes ?? null,
    lines: input.rows.map((row, index) => ({
      id: `procurement_line_${crypto.randomUUID()}`,
      procurementOrderId: orderId,
      lineNumber: index + 1,
      masterItemId: row.masterItemId,
      inventoryItemId: row.inventoryItemId,
      description: row.name,
      quantityOrdered: row.suggestedQuantity,
      quantityReceived: 0,
      unitOfMeasure: row.unitOfMeasure,
      unitCostCents: row.unitCostCents,
      suggestedQuantity: row.suggestedQuantity,
      sourceReason: row.reason,
      sourcePurchaseOrderLineId: row.sourcePurchaseOrderLineId,
    })),
  };

  for (const line of order.lines) {
    assertPositiveQuantity(line.quantityOrdered);
  }

  const transaction = {
    order: { ...order, createdByUserId: input.actorUserId },
    lines: order.lines,
    audit: {
    actorUserId: input.actorUserId,
    entityType: "procurement_order",
    entityId: order.id,
    action: "procurement_order.created",
    metadata: { procurementOrderNumber: order.procurementOrderNumber, lineCount: order.lines.length },
    },
  } satisfies ProcurementDraftTransactionInput;

  if (store.createDraftOrderTransaction) {
    await store.createDraftOrderTransaction(transaction);
  } else {
    await store.createOrder(transaction.order);
    for (const line of transaction.lines) {
      await store.createOrderLine(line);
    }
    await store.createAuditEvent(transaction.audit);
  }

  return order;
}

export async function submitProcurementOrder(store: ProcurementStore, input: {
  procurementOrderId: string;
  actorUserId?: string;
}) {
  const order = await requireOrder(store, input.procurementOrderId);
  if (order.status !== "draft") {
    throw new ProcurementError("INVALID_PROCUREMENT_STATUS", "Only draft procurement orders can be submitted");
  }
  await store.updateOrder({ id: order.id, status: "ordered", submittedByUserId: input.actorUserId });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "procurement_order",
    entityId: order.id,
    action: "procurement_order.submitted",
    metadata: { fromStatus: order.status, toStatus: "ordered" },
  });
  return { ...order, status: "ordered" as const };
}

export async function cancelProcurementOrder(store: ProcurementStore, input: {
  procurementOrderId: string;
  actorUserId?: string;
}) {
  const order = await requireOrder(store, input.procurementOrderId);
  if (order.status === "cancelled") return order;
  if (order.status === "completed" || order.status === "partially_received") {
    throw new ProcurementError("INVALID_PROCUREMENT_STATUS", "Received procurement orders cannot be cancelled here");
  }
  await store.updateOrder({ id: order.id, status: "cancelled" });
  await store.createAuditEvent({
    actorUserId: input.actorUserId,
    entityType: "procurement_order",
    entityId: order.id,
    action: "procurement_order.cancelled",
    metadata: { fromStatus: order.status, toStatus: "cancelled" },
  });
  return { ...order, status: "cancelled" as const };
}

export async function receiveProcurementOrder(store: ProcurementStore, input: {
  procurementOrderId: string;
  receiptDate: string;
  actorUserId?: string;
  lines: Array<{
    procurementOrderLineId: string;
    receivedQuantity: number;
    lotNumber?: string | null;
    location?: string | null;
  }>;
}) {
  if (input.lines.length === 0) {
    throw new ProcurementError("PROCUREMENT_RECEIPT_LINES_REQUIRED", "Receipt requires at least one line");
  }

  const order = await requireOrder(store, input.procurementOrderId);
  if (order.status === "completed") {
    throw new ProcurementError("PROCUREMENT_ORDER_ALREADY_COMPLETED", "Procurement order is already completed");
  }
  if (!["ordered", "partially_received"].includes(order.status)) {
    throw new ProcurementError("INVALID_PROCUREMENT_STATUS", "Only ordered procurement orders can be received");
  }

  const lineUpdates = input.lines.map((receiptLine) => {
    assertPositiveQuantity(receiptLine.receivedQuantity);
    const line = order.lines.find((candidate) => candidate.id === receiptLine.procurementOrderLineId);
    if (!line) throw new ProcurementError("PROCUREMENT_ORDER_LINE_NOT_FOUND", "Procurement order line not found");
    const newReceived = +(line.quantityReceived + receiptLine.receivedQuantity).toFixed(2);
    if (newReceived > line.quantityOrdered) {
      throw new ProcurementError("PROCUREMENT_OVER_RECEIPT", "Received quantity cannot exceed ordered quantity");
    }
    return { line, receiptLine, newReceived };
  });

  const finalReceivedByLine = new Map(order.lines.map((line) => [line.id, line.quantityReceived]));
  for (const update of lineUpdates) finalReceivedByLine.set(update.line.id, update.newReceived);
  const isFinal = order.lines.every((line) => (finalReceivedByLine.get(line.id) ?? 0) >= line.quantityOrdered);
  const receiptId = `procurement_receipt_${crypto.randomUUID()}`;
  const receiptNumber = `PRR-${await store.nextReceiptSequence()}`;
  const inventorySnapshots = new Map<string, {
    id: string;
    onHandQuantity: number;
    lotNumber: string | null;
    location: string | null;
  }>();

  for (const update of lineUpdates) {
    if (!update.line.inventoryItemId || !store.getInventoryItem) continue;
    const inventoryItem = await store.getInventoryItem(update.line.inventoryItemId);
    if (!inventoryItem) {
      throw new ProcurementError(
        "PROCUREMENT_INVENTORY_ITEM_NOT_FOUND",
        `Inventory item is required for procurement order line ${update.line.id}`,
      );
    }
    inventorySnapshots.set(update.line.inventoryItemId, inventoryItem);
  }

  const transaction = {
    receipt: {
      id: receiptId,
      receiptNumber,
      procurementOrderId: order.id,
      receiptDate: input.receiptDate,
      receivedByUserId: input.actorUserId,
      isFinal,
    },
    lines: lineUpdates.map((update) => ({
      receiptLineId: `procurement_receipt_line_${crypto.randomUUID()}`,
      procurementOrderLineId: update.line.id,
      inventoryItemId: update.line.inventoryItemId,
      receivedQuantity: update.receiptLine.receivedQuantity,
      lotNumber: update.receiptLine.lotNumber ?? null,
      location: update.receiptLine.location ?? null,
      finalReceivedQuantity: update.newReceived,
    })),
    orderUpdate: {
      id: order.id,
      status: isFinal ? "completed" as const : "partially_received" as const,
      receivedDate: isFinal ? input.receiptDate : order.receivedDate,
    },
    audit: {
      actorUserId: input.actorUserId,
      entityType: "procurement_order",
      entityId: order.id,
      action: "procurement_order.received",
      metadata: {
        receiptNumber,
        receivedLineCount: input.lines.length,
        isFinal,
      },
    },
  } satisfies ProcurementReceiptTransactionInput;

  if (store.receiveOrderTransaction) {
    await store.receiveOrderTransaction(transaction);
  } else {
    await store.createReceipt(transaction.receipt);

    const completedLines: typeof transaction.lines = [];

    try {
      for (const line of transaction.lines) {
        await applyReceiptLine(store, receiptId, line, input.actorUserId, inventorySnapshots);
        completedLines.push(line);
      }

      await store.updateOrder(transaction.orderUpdate);
      await store.createAuditEvent(transaction.audit);
    } catch (error) {
      await rollbackProcurementReceipt(store, {
        receiptId,
        completedLines,
        inventorySnapshots,
      });
      throw error;
    }
  }

  return {
    ...order,
    status: transaction.orderUpdate.status,
    receivedDate: isFinal ? input.receiptDate : order.receivedDate,
    lines: order.lines.map((line) => ({
      ...line,
      quantityReceived: finalReceivedByLine.get(line.id) ?? line.quantityReceived,
    })),
  };
}

async function applyReceiptLine(
  store: ProcurementStore,
  receiptId: string,
  line: ProcurementReceiptTransactionInput["lines"][number],
  actorUserId?: string,
  inventorySnapshots?: Map<string, {
    id: string;
    onHandQuantity: number;
    lotNumber: string | null;
    location: string | null;
  }>,
) {
  let receiptLineCreated = false;
  let inventoryApplied = false;

  try {
    await store.createReceiptLine({
      id: line.receiptLineId,
      procurementReceiptId: receiptId,
      procurementOrderLineId: line.procurementOrderLineId,
      inventoryItemId: line.inventoryItemId,
      receivedQuantity: line.receivedQuantity,
      lotNumber: line.lotNumber ?? null,
      location: line.location ?? null,
    });
    receiptLineCreated = true;

    if (line.inventoryItemId) {
      await store.increaseInventory({
        inventoryItemId: line.inventoryItemId,
        quantity: line.receivedQuantity,
        referenceId: line.receiptLineId,
        actorUserId,
        lotNumber: line.lotNumber ?? null,
        location: line.location ?? null,
      });
      inventoryApplied = true;
    }

    await store.updateLineReceivedQuantity({
      lineId: line.procurementOrderLineId,
      quantityReceived: line.finalReceivedQuantity,
    });
  } catch (error) {
    await rollbackReceiptLine(store, {
      line,
      receiptId,
      receiptLineCreated,
      inventoryApplied,
      inventorySnapshots,
    });
    throw error;
  }
}

async function rollbackReceiptLine(
  store: ProcurementStore,
  input: {
    line: ProcurementReceiptTransactionInput["lines"][number];
    receiptId: string;
    receiptLineCreated: boolean;
    inventoryApplied: boolean;
    inventorySnapshots?: Map<string, {
      id: string;
      onHandQuantity: number;
      lotNumber: string | null;
      location: string | null;
    }>;
  },
) {
  const rollbackTasks: Promise<unknown>[] = [];
  if (input.receiptLineCreated && store.deleteReceiptLine) {
    rollbackTasks.push(store.deleteReceiptLine(input.line.receiptLineId));
  }
  if (input.inventoryApplied && store.restoreInventoryItem && input.line.inventoryItemId && input.inventorySnapshots) {
    const snapshot = input.inventorySnapshots.get(input.line.inventoryItemId);
    if (snapshot) {
      rollbackTasks.push(store.restoreInventoryItem(snapshot));
    }
  }
  await Promise.allSettled(rollbackTasks);
}

async function rollbackProcurementReceipt(
  store: ProcurementStore,
  input: {
    receiptId: string;
    completedLines: ProcurementReceiptTransactionInput["lines"];
    inventorySnapshots: Map<string, {
      id: string;
      onHandQuantity: number;
      lotNumber: string | null;
      location: string | null;
    }>;
  },
) {
  const rollbackStatements: Array<Promise<unknown>> = [];

  for (const line of [...input.completedLines].reverse()) {
    rollbackStatements.push(store.updateLineReceivedQuantity({
      lineId: line.procurementOrderLineId,
      quantityReceived: line.finalReceivedQuantity - line.receivedQuantity,
    }));
    if (line.inventoryItemId && store.restoreInventoryItem) {
      const snapshot = input.inventorySnapshots.get(line.inventoryItemId);
      if (snapshot) {
        rollbackStatements.push(store.restoreInventoryItem(snapshot));
      }
    }
    if (store.deleteReceiptLine) {
      rollbackStatements.push(store.deleteReceiptLine(line.receiptLineId));
    }
  }

  if (store.deleteReceipt) {
    rollbackStatements.push(store.deleteReceipt(input.receiptId));
  }

  await Promise.allSettled(rollbackStatements);
}

async function requireOrder(store: ProcurementStore, procurementOrderId: string) {
  const order = await store.getOrder(procurementOrderId);
  if (!order) {
    throw new ProcurementError("PROCUREMENT_ORDER_NOT_FOUND", "Procurement order not found");
  }
  return order;
}

function assertPositiveQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ProcurementError("INVALID_QUANTITY", "Quantity must be greater than zero");
  }
}

function procurementStatusFor(code: string) {
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (
    code === "INVALID_PROCUREMENT_STATUS" ||
    code === "PROCUREMENT_OVER_RECEIPT" ||
    code === "PROCUREMENT_ORDER_ALREADY_COMPLETED"
  ) {
    return 409;
  }
  return 400;
}
