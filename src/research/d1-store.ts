import type {
  ResearchRequestCommentRecord,
  ResearchRequestListStatus,
  ResearchRequestNoteRecord,
  ResearchRequestRecord,
  ResearchStore,
} from "./service";

type ResearchRequestRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  status: "queue" | "completed" | "archived";
  packaging_type: string | null;
  units_requested: number | null;
  product_description: string;
  submitted_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  archived_by_user_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ResearchRequestNoteRow = {
  id: string;
  rd_request_id: string;
  note: string;
  created_by_user_id: string | null;
  created_at: string;
};

type ResearchRequestCommentRow = {
  id: string;
  rd_request_id: string;
  comment: string;
  created_by_user_id: string | null;
  created_at: string;
};

export class D1ResearchStore implements ResearchStore {
  constructor(private readonly db: D1Database) {}

  async customerExists(customerId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `
          SELECT id
          FROM customers
          WHERE id = ?
        `,
      )
      .bind(customerId)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async listResearchRequests(status: ResearchRequestListStatus): Promise<ResearchRequestRecord[]> {
    const query =
      status === "all"
        ? `
          SELECT rr.id, rr.customer_id, c.name AS customer_name, rr.status, rr.packaging_type,
                 rr.units_requested, rr.product_description, rr.submitted_at, rr.completed_at,
                 rr.archived_at, rr.archived_by_user_id, rr.created_by_user_id, rr.updated_by_user_id,
                 rr.created_at, rr.updated_at
          FROM rd_requests rr
          LEFT JOIN customers c ON c.id = rr.customer_id
          ORDER BY rr.updated_at DESC, rr.created_at DESC, rr.id DESC
        `
        : `
          SELECT rr.id, rr.customer_id, c.name AS customer_name, rr.status, rr.packaging_type,
                 rr.units_requested, rr.product_description, rr.submitted_at, rr.completed_at,
                 rr.archived_at, rr.archived_by_user_id, rr.created_by_user_id, rr.updated_by_user_id,
                 rr.created_at, rr.updated_at
          FROM rd_requests rr
          LEFT JOIN customers c ON c.id = rr.customer_id
          WHERE rr.status = ?
          ORDER BY rr.updated_at DESC, rr.created_at DESC, rr.id DESC
        `;

    const stmt = this.db.prepare(query);
    const rows = status === "all" ? await stmt.all<ResearchRequestRow>() : await stmt.bind(status).all<ResearchRequestRow>();

    return Promise.all((rows.results ?? []).map((row) => this.hydrateResearchRequest(row)));
  }

  async getResearchRequest(requestId: string): Promise<ResearchRequestRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT rr.id, rr.customer_id, c.name AS customer_name, rr.status, rr.packaging_type,
                 rr.units_requested, rr.product_description, rr.submitted_at, rr.completed_at,
                 rr.archived_at, rr.archived_by_user_id, rr.created_by_user_id, rr.updated_by_user_id,
                 rr.created_at, rr.updated_at
          FROM rd_requests rr
          LEFT JOIN customers c ON c.id = rr.customer_id
          WHERE rr.id = ?
        `,
      )
      .bind(requestId)
      .first<ResearchRequestRow>();
    return row ? this.hydrateResearchRequest(row) : null;
  }

  async createResearchRequest(input: {
    id: string;
    customerId: string;
    packagingType: string;
    unitsRequested: number;
    productDescription: string;
    submittedAt: string;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord> {
    await this.db
      .prepare(
        `
          INSERT INTO rd_requests (
            id, customer_id, status, packaging_type, units_requested, product_description,
            submitted_at, completed_at, archived_at, archived_by_user_id,
            created_by_user_id, updated_by_user_id
          )
          VALUES (?, ?, 'queue', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        `,
      )
      .bind(
        input.id,
        input.customerId,
        input.packagingType,
        input.unitsRequested,
        input.productDescription,
        input.submittedAt,
        input.actorUserId ?? null,
        input.actorUserId ?? null,
      )
      .run();

    const request = await this.getResearchRequest(input.id);
    if (!request) throw new Error("Research request insert failed");
    return request;
  }

  async updateResearchRequest(input: {
    requestId: string;
    customerId: string;
    packagingType: string | null;
    unitsRequested: number | null;
    productDescription: string;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE rd_requests
          SET customer_id = ?,
              packaging_type = ?,
              units_requested = ?,
              product_description = ?,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.customerId,
        input.packagingType,
        input.unitsRequested,
        input.productDescription,
        input.actorUserId ?? null,
        input.requestId,
      )
      .run();
    return this.getResearchRequest(input.requestId);
  }

  async addResearchRequestNote(input: {
    requestId: string;
    note: string;
    actorUserId?: string;
  }): Promise<ResearchRequestNoteRecord> {
    const id = `rd_request_note_${crypto.randomUUID()}`;
    await this.db
      .prepare(
        `
          INSERT INTO rd_request_notes (id, rd_request_id, note, created_by_user_id)
          VALUES (?, ?, ?, ?)
        `,
      )
      .bind(id, input.requestId, input.note, input.actorUserId ?? null)
      .run();
    const row = await this.db
      .prepare(
        `
          SELECT id, rd_request_id, note, created_by_user_id, created_at
          FROM rd_request_notes
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ResearchRequestNoteRow>();
    if (!row) throw new Error("Research request note insert failed");
    return mapNoteRow(row);
  }

  async addResearchRequestComment(input: {
    requestId: string;
    comment: string;
    actorUserId?: string;
  }): Promise<ResearchRequestCommentRecord> {
    const id = `rd_request_comment_${crypto.randomUUID()}`;
    await this.db
      .prepare(
        `
          INSERT INTO rd_request_comments (id, rd_request_id, comment, created_by_user_id)
          VALUES (?, ?, ?, ?)
        `,
      )
      .bind(id, input.requestId, input.comment, input.actorUserId ?? null)
      .run();
    const row = await this.db
      .prepare(
        `
          SELECT id, rd_request_id, comment, created_by_user_id, created_at
          FROM rd_request_comments
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<ResearchRequestCommentRow>();
    if (!row) throw new Error("Research request comment insert failed");
    return mapCommentRow(row);
  }

  async updateResearchRequestStatus(input: {
    requestId: string;
    status: "queue" | "completed" | "archived";
    completedAt?: string | null;
    archivedAt?: string | null;
    archivedByUserId?: string | null;
    actorUserId?: string;
  }): Promise<ResearchRequestRecord | null> {
    await this.db
      .prepare(
        `
          UPDATE rd_requests
          SET status = ?,
              completed_at = ?,
              archived_at = ?,
              archived_by_user_id = ?,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        input.status,
        input.completedAt ?? null,
        input.archivedAt ?? null,
        input.archivedByUserId ?? null,
        input.actorUserId ?? null,
        input.requestId,
      )
      .run();
    return this.getResearchRequest(input.requestId);
  }

  async createAuditEvent(input: {
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO audit_events (
            id, actor_user_id, entity_type, entity_id, action, metadata_json
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `audit_${crypto.randomUUID()}`,
        input.actorUserId ?? null,
        input.entityType,
        input.entityId,
        input.action,
        JSON.stringify(input.metadata),
      )
      .run();
  }

  private async hydrateResearchRequest(row: ResearchRequestRow): Promise<ResearchRequestRecord> {
    const [notes, comments] = await Promise.all([
      this.db
        .prepare(
          `
            SELECT id, rd_request_id, note, created_by_user_id, created_at
            FROM rd_request_notes
            WHERE rd_request_id = ?
            ORDER BY created_at ASC, id ASC
          `,
        )
        .bind(row.id)
        .all<ResearchRequestNoteRow>(),
      this.db
        .prepare(
          `
            SELECT id, rd_request_id, comment, created_by_user_id, created_at
            FROM rd_request_comments
            WHERE rd_request_id = ?
            ORDER BY created_at ASC, id ASC
          `,
        )
        .bind(row.id)
        .all<ResearchRequestCommentRow>(),
    ]);

    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      status: row.status,
      packagingType: row.packaging_type,
      unitsRequested: row.units_requested,
      productDescription: row.product_description,
      submittedAt: row.submitted_at,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
      archivedByUserId: row.archived_by_user_id,
      createdByUserId: row.created_by_user_id,
      updatedByUserId: row.updated_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      notes: (notes.results ?? []).map(mapNoteRow),
      comments: (comments.results ?? []).map(mapCommentRow),
    };
  }
}

function mapNoteRow(row: ResearchRequestNoteRow): ResearchRequestNoteRecord {
  return {
    id: row.id,
    requestId: row.rd_request_id,
    note: row.note,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

function mapCommentRow(row: ResearchRequestCommentRow): ResearchRequestCommentRecord {
  return {
    id: row.id,
    requestId: row.rd_request_id,
    comment: row.comment,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
