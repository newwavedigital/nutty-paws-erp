import { describe, expect, it } from "vitest";
import {
  archiveResearchRequest,
  appendResearchRequestComment,
  appendResearchRequestNote,
  completeResearchRequest,
  createResearchRequest,
  exportResearchRequestsCsv,
  listResearchRequests,
  readResearchRequest,
  reopenResearchRequest,
  updateResearchRequest,
  type ResearchRequestRecord,
  type ResearchStore,
} from "../src/research/service";

function makeRequest(overrides: Partial<ResearchRequestRecord> = {}): ResearchRequestRecord {
  return {
    id: "rd-request-1",
    customerId: "customer-1",
    customerName: "Customer One",
    status: "queue",
    packagingType: "Jar",
    unitsRequested: 12,
    productDescription: "Sample peanut butter prototype",
    submittedAt: "2026-06-20T00:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    notes: [],
    comments: [],
    ...overrides,
  };
}

function createStore() {
  const customers = new Set(["customer-1"]);
  const requests = new Map<string, ResearchRequestRecord>([
    [
      "rd-request-queue",
      makeRequest({
        id: "rd-request-queue",
        productDescription: "Queue request",
      }),
    ],
    [
      "rd-request-completed",
      makeRequest({
        id: "rd-request-completed",
        status: "completed",
        packagingType: "Pouch",
        unitsRequested: 24,
        productDescription: "Completed request",
        completedAt: "2026-06-20T01:00:00.000Z",
        updatedAt: "2026-06-20T01:00:00.000Z",
        notes: [
          {
            id: "note-completed-1",
            requestId: "rd-request-completed",
            note: "Initial working note",
            createdByUserId: "user-1",
            createdAt: "2026-06-20T00:30:00.000Z",
          },
        ],
        comments: [
          {
            id: "comment-completed-1",
            requestId: "rd-request-completed",
            comment: "Post-production comment",
            createdByUserId: "user-1",
            createdAt: "2026-06-20T01:30:00.000Z",
          },
        ],
      }),
    ],
  ]);
  const auditEvents: Array<{ action: string; metadata: Record<string, unknown> }> = [];

  const store: ResearchStore & {
    auditEvents: Array<{ action: string; metadata: Record<string, unknown> }>;
  } = {
    auditEvents,
    async customerExists(customerId) {
      return customers.has(customerId);
    },
    async listResearchRequests(status) {
      return [...requests.values()]
        .filter((request) => status === "all" || request.status === status)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async getResearchRequest(requestId) {
      return requests.get(requestId) ?? null;
    },
    async createResearchRequest(input) {
      const created = makeRequest({
        id: input.id,
        customerId: input.customerId,
        packagingType: input.packagingType,
        unitsRequested: input.unitsRequested,
        productDescription: input.productDescription,
        submittedAt: input.submittedAt,
        createdByUserId: input.actorUserId ?? null,
        updatedByUserId: input.actorUserId ?? null,
      });
      requests.set(created.id, created);
      return created;
    },
    async updateResearchRequest(input) {
      const current = requests.get(input.requestId);
      if (!current) return null;
      const updated = {
        ...current,
        customerId: input.customerId ?? current.customerId,
        packagingType: input.packagingType ?? current.packagingType,
        unitsRequested: input.unitsRequested ?? current.unitsRequested,
        productDescription: input.productDescription ?? current.productDescription,
        updatedByUserId: input.actorUserId ?? null,
        updatedAt: "2026-06-20T02:00:00.000Z",
      };
      requests.set(updated.id, updated);
      return updated;
    },
    async addResearchRequestNote(input) {
      const current = requests.get(input.requestId);
      if (!current) throw new Error("missing request");
      const note = {
        id: `note-${current.notes.length + 1}`,
        requestId: input.requestId,
        note: input.note,
        createdByUserId: input.actorUserId ?? null,
        createdAt: "2026-06-20T02:00:00.000Z",
      };
      requests.set(current.id, { ...current, notes: [...current.notes, note], updatedAt: "2026-06-20T02:00:00.000Z" });
      return note;
    },
    async addResearchRequestComment(input) {
      const current = requests.get(input.requestId);
      if (!current) throw new Error("missing request");
      const comment = {
        id: `comment-${current.comments.length + 1}`,
        requestId: input.requestId,
        comment: input.comment,
        createdByUserId: input.actorUserId ?? null,
        createdAt: "2026-06-20T02:30:00.000Z",
      };
      requests.set(current.id, {
        ...current,
        comments: [...current.comments, comment],
        updatedAt: "2026-06-20T02:30:00.000Z",
      });
      return comment;
    },
    async updateResearchRequestStatus(input) {
      const current = requests.get(input.requestId);
      if (!current) return null;
      const updated = {
        ...current,
        status: input.status,
        completedAt: input.completedAt ?? current.completedAt,
        archivedAt: input.archivedAt ?? current.archivedAt,
        archivedByUserId: input.archivedByUserId ?? current.archivedByUserId,
        updatedByUserId: input.actorUserId ?? null,
        updatedAt: "2026-06-20T03:00:00.000Z",
      };
      if (input.status === "queue") {
        updated.completedAt = null;
        updated.archivedAt = null;
        updated.archivedByUserId = null;
      }
      requests.set(updated.id, updated);
      return updated;
    },
    async createAuditEvent(input) {
      auditEvents.push({ action: input.action, metadata: input.metadata });
    },
  };

  return { store, requests, auditEvents };
}

describe("research service", () => {
  it("creates, lists, updates, comments, completes, reopens, archives, and exports requests", async () => {
    const { store } = createStore();

    await expect(listResearchRequests(store, "queue")).resolves.toHaveLength(1);
    await expect(listResearchRequests(store, "completed")).resolves.toHaveLength(1);

    const created = await createResearchRequest(store, {
      customerId: "customer-1",
      packagingType: "Tub",
      unitsRequested: 15,
      productDescription: "Research sample with cacao",
      workingNote: "Needs a smooth texture",
      actorUserId: "user-1",
    });

    expect(created.status).toBe("queue");
    expect(created.notes).toHaveLength(1);
    expect(created.notes[0]).toMatchObject({ note: "Needs a smooth texture" });

    const updated = await updateResearchRequest(store, {
      requestId: created.id,
      customerId: "customer-1",
      packagingType: "Pouch",
      unitsRequested: 20,
      productDescription: "Updated product description",
      actorUserId: "user-1",
    });
    expect(updated.packagingType).toBe("Pouch");
    expect(updated.unitsRequested).toBe(20);

    await appendResearchRequestNote(store, {
      requestId: created.id,
      note: "Keep the batch small",
      actorUserId: "user-1",
    });

    await expect(
      appendResearchRequestComment(store, {
        requestId: created.id,
        comment: "Post-production summary",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "RESEARCH_REQUEST_NOT_COMPLETED", status: 409 });

    const completed = await completeResearchRequest(store, { requestId: created.id, actorUserId: "user-1" });
    expect(completed.status).toBe("completed");

    const comment = await appendResearchRequestComment(store, {
      requestId: created.id,
      comment: "Post-production summary",
      actorUserId: "user-1",
    });
    expect(comment.comment).toBe("Post-production summary");

    const reopened = await reopenResearchRequest(store, { requestId: created.id, actorUserId: "user-1" });
    expect(reopened.status).toBe("queue");
    expect(reopened.notes).toHaveLength(2);
    expect(reopened.comments).toHaveLength(1);

    const archived = await archiveResearchRequest(store, { requestId: created.id, actorUserId: "user-1" });
    expect(archived.status).toBe("archived");

    await expect(
      updateResearchRequest(store, {
        requestId: created.id,
        customerId: "customer-1",
        packagingType: "Jar",
        unitsRequested: 10,
        productDescription: "Should fail",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "RESEARCH_REQUEST_ARCHIVED", status: 409 });

    await expect(
      appendResearchRequestNote(store, { requestId: created.id, note: "blocked" }),
    ).rejects.toMatchObject({ code: "RESEARCH_REQUEST_ARCHIVED", status: 409 });

    const csv = await exportResearchRequestsCsv(store, "archived");
    expect(csv).toContain("requestId,customerId,customerName,status");
    expect(csv).toContain(created.id);
    expect(csv).toContain("archived");
  });

  it("rejects creates with missing customers and invalid quantities", async () => {
    const { store } = createStore();

    await expect(
      createResearchRequest(store, {
        customerId: "customer-missing",
        packagingType: "Jar",
        unitsRequested: 1,
        productDescription: "Missing customer",
      }),
    ).rejects.toMatchObject({ code: "RESEARCH_CUSTOMER_NOT_FOUND", status: 404 });

    await expect(
      createResearchRequest(store, {
        customerId: "customer-1",
        packagingType: "Jar",
        unitsRequested: 0,
        productDescription: "Invalid quantity",
      }),
    ).rejects.toMatchObject({ code: "RESEARCH_VALIDATION_ERROR", status: 400 });
  });

  it("returns read requests with note and comment history", async () => {
    const { store } = createStore();

    const request = await readResearchRequest(store, "rd-request-completed");
    expect(request?.notes).toHaveLength(1);
    expect(request?.comments).toHaveLength(1);
    expect(request?.customerName).toBe("Customer One");
  });
});
