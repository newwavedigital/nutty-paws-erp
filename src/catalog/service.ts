export type ProductStatus = "active" | "inactive";
export type MasterItemType = "raw_material" | "packaging" | "finished_good" | "other";

export type ProductRecord = {
  id: string;
  customerId: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  productionRoom?: string | null;
  size?: number | null;
  sizeUnit?: string | null;
  caseQuantity?: number | null;
  caseSticker?: string | null;
  unitPriceCents?: number | null;
  kosher?: boolean;
  allergen?: boolean;
  allergenDetails?: string | null;
  dailyProductionRate?: number | null;
  notes?: string | null;
  bomItems?: ProductBomRecord[];
};

export type MasterItemRecord = {
  id: string;
  sku: string;
  name: string;
  itemType: MasterItemType;
  unitOfMeasure: string;
  customerId?: string | null;
  allergens?: string[];
  status?: "active" | "archived";
  archivedAt?: string | null;
  archivedByUserId?: string | null;
};

export type ProductBomRecord = {
  id: string;
  productId: string;
  masterItemId: string;
  quantityPerUnit: number;
  percentOfFormula?: number | null;
};

export type ProductBomInput = {
  masterItemId: string;
  quantityPerUnit: number;
  percentOfFormula?: number | null;
};

export type ProductInput = {
  id: string;
  customerId: string | null;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  productionRoom: string | null;
  size: number | null;
  sizeUnit: string | null;
  caseQuantity: number | null;
  caseSticker: string | null;
  unitPriceCents: number | null;
  kosher: boolean;
  allergen: boolean;
  allergenDetails: string | null;
  dailyProductionRate: number | null;
  notes: string | null;
  bomItems: ProductBomInput[];
};

export type MasterItemInput = {
  id: string;
  sku: string;
  name: string;
  itemType: MasterItemType;
  unitOfMeasure: string;
  customerId: string | null;
  allergens: string[];
};

export type CatalogStore = {
  listProducts(): Promise<ProductRecord[]>;
  getProduct(id: string): Promise<ProductRecord | null>;
  createProduct?(input: ProductInput): Promise<ProductRecord>;
  updateProduct?(id: string, input: ProductInput): Promise<ProductRecord | null>;
  archiveProduct?(id: string): Promise<ProductRecord | null>;
  replaceProductBomItems?(productId: string, bomItems: ProductBomInput[]): Promise<ProductRecord | null>;
  listMasterItems(): Promise<MasterItemRecord[]>;
  getMasterItem(id: string): Promise<MasterItemRecord | null>;
  createMasterItem?(input: MasterItemInput): Promise<MasterItemRecord>;
  updateMasterItem?(id: string, input: MasterItemInput): Promise<MasterItemRecord | null>;
  archiveMasterItem?(id: string, input: { archivedAt: string; actorUserId?: string }): Promise<MasterItemRecord | null>;
};
