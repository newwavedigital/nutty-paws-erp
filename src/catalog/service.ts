export type ProductStatus = "active" | "inactive";
export type MasterItemType = "raw_material" | "packaging" | "finished_good" | "other";

export type ProductRecord = {
  id: string;
  customerId: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
};

export type MasterItemRecord = {
  id: string;
  sku: string;
  name: string;
  itemType: MasterItemType;
  unitOfMeasure: string;
};

export type CatalogStore = {
  listProducts(): Promise<ProductRecord[]>;
  getProduct(id: string): Promise<ProductRecord | null>;
  listMasterItems(): Promise<MasterItemRecord[]>;
  getMasterItem(id: string): Promise<MasterItemRecord | null>;
};
