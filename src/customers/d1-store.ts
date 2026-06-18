import type { CustomerRecord, CustomerStatus, CustomerStore, CustomerUpdateInput } from "./service";

type CustomerRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  status: CustomerStatus;
};

export class D1CustomerStore implements CustomerStore {
  constructor(private readonly db: D1Database) {}

  async listCustomers(): Promise<CustomerRecord[]> {
    const result = await this.db
      .prepare(
        `
          SELECT id, name, contact_name, contact_email, phone, status
          FROM customers
          ORDER BY name
        `,
      )
      .all<CustomerRow>();

    return (result.results ?? []).map(mapCustomer);
  }

  async getCustomer(id: string): Promise<CustomerRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT id, name, contact_name, contact_email, phone, status
          FROM customers
          WHERE id = ?
        `,
      )
      .bind(id)
      .first<CustomerRow>();

    return row ? mapCustomer(row) : null;
  }

  async updateCustomer(id: string, input: CustomerUpdateInput): Promise<CustomerRecord | null> {
    const existing = await this.getCustomer(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    };

    await this.db
      .prepare(
        `
          UPDATE customers
          SET name = ?,
              contact_name = ?,
              contact_email = ?,
              phone = ?,
              status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(updated.name, updated.contactName, updated.contactEmail, updated.phone, updated.status, id)
      .run();

    return updated;
  }
}

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    phone: row.phone,
    status: row.status,
  };
}
