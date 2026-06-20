import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { registerResearchRoutes } from "../src/research/routes";
import type { ResearchRequestRecord, ResearchStore } from "../src/research/service";

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
      }),
    ],
  ]);

  const store: ResearchStore = {
    async customerExists(customerId) {
      return customers.has(customerId);
    },
    async listResearchRequests(status) {
      return [...requests.values()].filter((request) => status === "all" || request.status === status);
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
      requests.set(current.id, { ...current, notes: [...current.notes, note] });
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
      requests.set(current.id, { ...current, comments: [...current.comments, comment] });
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
      };
      if (input.status === "queue") {
        updated.completedAt = null;
        updated.archivedAt = null;
        updated.archivedByUserId = null;
      }
      requests.set(updated.id, updated);
      return updated;
    },
    async createAuditEvent() {},
  };

  return { store, requests };
}

function createRouteApp() {
  const { store } = createStore();
  return createApp((app) => registerResearchRoutes(app, () => store));
}

describe("research routes", () => {
  it("lists queue and completed requests, supports lifecycle actions, and exports csv", async () => {
    const app = createRouteApp();

    const queueList = await app.request("/api/research/requests?status=queue");
    const completedList = await app.request("/api/research/requests?status=completed");
    const created = await app.request("/api/research/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        packagingType: "Tub",
        unitsRequested: 15,
        productDescription: "New prototype",
        workingNote: "Use roasted almonds",
      }),
    });

    expect(queueList.status).toBe(200);
    await expect(queueList.json()).resolves.toMatchObject({ ok: true, data: [expect.objectContaining({ status: "queue" })] });
    expect(completedList.status).toBe(200);
    await expect(completedList.json()).resolves.toMatchObject({ ok: true, data: [expect.objectContaining({ status: "completed" })] });
    expect(created.status).toBe(200);

    const createdBody = (await created.json()) as { data: ResearchRequestRecord };
    const requestId = createdBody.data.id;

    const updated = await app.request(`/api/research/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        packagingType: "Pouch",
        unitsRequested: 18,
        productDescription: "Updated prototype",
      }),
    });
    expect(updated.status).toBe(200);

    const note = await app.request(`/api/research/requests/${requestId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "Working note" }),
    });
    expect(note.status).toBe(200);

    const complete = await app.request(`/api/research/requests/${requestId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(complete.status).toBe(200);
    await expect(complete.json()).resolves.toMatchObject({ ok: true, data: { status: "completed" } });

    const comment = await app.request(`/api/research/requests/${requestId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "Post-production note" }),
    });
    expect(comment.status).toBe(200);

    const reopen = await app.request(`/api/research/requests/${requestId}/reopen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(reopen.status).toBe(200);

    const archive = await app.request(`/api/research/requests/${requestId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(archive.status).toBe(200);

    const archivedList = await app.request("/api/research/requests?status=archived");
    expect(archivedList.status).toBe(200);
    await expect(archivedList.json()).resolves.toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: requestId, status: "archived" })],
    });

    const csv = await app.request("/api/research/requests/export.csv?status=archived");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain(requestId);

    const read = await app.request(`/api/research/requests/${requestId}`);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      ok: true,
      data: {
        id: requestId,
        notes: expect.arrayContaining([
          expect.objectContaining({ note: "Use roasted almonds" }),
          expect.objectContaining({ note: "Working note" }),
        ]),
        comments: [{ comment: "Post-production note" }],
      },
    });
  });

  it("blocks invalid statuses and archived edits", async () => {
    const app = createRouteApp();

    const invalid = await app.request("/api/research/requests?status=bogus");
    expect(invalid.status).toBe(400);

    const archive = await app.request("/api/research/requests/rd-request-completed/archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(archive.status).toBe(200);

    const updateArchived = await app.request("/api/research/requests/rd-request-completed", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        packagingType: "Jar",
        unitsRequested: 30,
        productDescription: "Blocked edit",
      }),
    });
    expect(updateArchived.status).toBe(409);
    await expect(updateArchived.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "RESEARCH_REQUEST_ARCHIVED" },
    });
  });
});
