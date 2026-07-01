export type CustomerStatus = "active" | "inactive";

export type CustomerRecord = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  status: CustomerStatus;
};

export type CustomerUpdateInput = Partial<{
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  status: CustomerStatus;
}>;

export type CustomerStore = {
  listCustomers(): Promise<CustomerRecord[]>;
  getCustomer(id: string): Promise<CustomerRecord | null>;
  createCustomer(input: CustomerRecord): Promise<CustomerRecord>;
  updateCustomer(id: string, input: CustomerUpdateInput): Promise<CustomerRecord | null>;
};
