import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_DATABASE = "nut-house-portal-staging-db";
export const DEMO_CATALOG_PREFIX = "demo_catalog";

const SUPPLIERS = [
  supplier("supplier_preferred_peanuts", "Demo Catalog - Preferred Peanut Co.", "active", {
    contactName: "Pat Demo",
    contactEmail: "preferred-peanuts@example.invalid",
    phone: "555-0101",
    type: "Ingredient",
    rating: "preferred",
    leadTimeDays: 5,
    moq: "8 pallets",
    edgeCase: "healthy preferred supplier",
    notes: "Dummy staging supplier with reliable lead time for baseline examples.",
  }),
  supplier("supplier_backup_roaster", "Demo Catalog - Backup Roaster Supply", "active", {
    contactName: "Robin Demo",
    contactEmail: "backup-roaster@example.invalid",
    phone: "555-0102",
    type: "Ingredient",
    rating: "backup",
    leadTimeDays: 12,
    moq: "2,000 lb",
    edgeCase: "backup supplier",
    notes: "Dummy staging backup option for comparing preferred versus backup supply.",
  }),
  supplier("supplier_long_lead_cacao", "Demo Catalog - Long Lead Cacao Import", "active", {
    contactName: "Casey Demo",
    contactEmail: "long-lead-cacao@example.invalid",
    type: "Ingredient",
    rating: "watch",
    leadTimeDays: 45,
    moq: "full container",
    edgeCase: "long_lead_time_supplier",
    notes: "Dummy staging supplier for high-risk lead-time conversations.",
  }),
  supplier("supplier_packaging_only", "Demo Catalog - Packaging Only Partners", "active", {
    contactName: "Parker Demo",
    contactEmail: "packaging-only@example.invalid",
    type: "Packaging",
    rating: "preferred",
    leadTimeDays: 14,
    moq: "25,000 labels",
    edgeCase: "packaging-only supplier",
    notes: "Dummy staging packaging supplier with high MOQ labels.",
  }),
  supplier("supplier_missing_contact", "Demo Catalog - Minimal Contact Vendor", "active", {
    type: "Ingredient",
    rating: "incomplete",
    leadTimeDays: null,
    moq: null,
    edgeCase: "missing optional contact fields",
    notes: "Dummy staging supplier intentionally missing phone and email.",
  }),
  supplier("supplier_allergen_sensitive", "Demo Catalog - Allergen Sensitive Seeds", "active", {
    contactName: "Allie Demo",
    contactEmail: "allergen-seeds@example.invalid",
    type: "Ingredient",
    rating: "approved",
    leadTimeDays: 9,
    moq: "40 cases",
    allergens: ["sesame", "tree nut"],
    edgeCase: "allergen-sensitive supplier",
    notes: "Dummy staging supplier with allergen notes for QA review examples.",
  }),
  supplier("supplier_archived_broker", "Demo Catalog - Archived Broker Example", "archived", {
    contactName: "Morgan Demo",
    contactEmail: "archived-broker@example.invalid",
    type: "Ingredient",
    rating: "archived",
    leadTimeDays: 21,
    moq: "spot buy",
    edgeCase: "archived_supplier",
    notes: "Dummy staging supplier that should appear only when archived records are requested.",
  }),
  supplier("supplier_cold_chain", "Demo Catalog - Cold Chain Almonds", "active", {
    contactName: "Chris Demo",
    contactEmail: "cold-chain@example.invalid",
    type: "Ingredient",
    rating: "approved",
    leadTimeDays: 18,
    moq: "1 refrigerated truck",
    edgeCase: "temperature-sensitive ingredient",
    notes: "Dummy staging supplier for refrigerated ingredient planning.",
  }),
  supplier("supplier_domestic_jars", "Demo Catalog - Domestic Jar Works", "active", {
    contactName: "Jamie Demo",
    contactEmail: "domestic-jars@example.invalid",
    type: "Packaging",
    rating: "preferred",
    leadTimeDays: 7,
    moq: "12 pallets",
    edgeCase: "fast packaging supplier",
    notes: "Dummy staging supplier for short-lead jar replenishment.",
  }),
  supplier("supplier_moq_specialty", "Demo Catalog - High MOQ Specialty Mix-ins", "active", {
    contactName: "Taylor Demo",
    contactEmail: "high-moq@example.invalid",
    type: "Ingredient",
    rating: "watch",
    leadTimeDays: 30,
    moq: "10,000 lb",
    edgeCase: "high MOQ",
    notes: "Dummy staging supplier for planning around large minimum buys.",
  }),
  supplier("supplier_local_honey", "Demo Catalog - Local Honey Cooperative", "active", {
    contactName: "Harper Demo",
    contactEmail: "local-honey@example.invalid",
    type: "Ingredient",
    rating: "approved",
    leadTimeDays: 4,
    moq: "10 pails",
    edgeCase: "small local supplier",
    notes: "Dummy staging supplier for small-batch seasonal supply.",
  }),
  supplier("supplier_freight_watch", "Demo Catalog - Freight Watch Cashews", "active", {
    contactName: "Riley Demo",
    contactEmail: "freight-watch@example.invalid",
    type: "Ingredient",
    rating: "watch",
    leadTimeDays: 24,
    moq: "5 pallets",
    edgeCase: "freight delay watch",
    notes: "Dummy staging supplier with freight-risk notes.",
  }),
];

const SUPPLIER_LINES = [
  line("preferred_peanuts_organic", "supplier_preferred_peanuts", "inventory_low_stock_peanuts", "Organic Runner Peanuts", "Ingredient", 186, "lb", "8 pallets", "Healthy stock baseline."),
  line("preferred_peanuts_roasted", "supplier_preferred_peanuts", "inventory_low_stock_peanuts", "Roasted Split Peanuts", "Ingredient", 203, "lb", "2 pallets", "Common production item."),
  line("backup_roaster_peanut", "supplier_backup_roaster", "inventory_healthy_base", "Backup Roasted Peanut", "Ingredient", 218, "lb", "2,000 lb", "Backup supply example."),
  line("backup_roaster_cashew", "supplier_backup_roaster", "inventory_cashew_freight", "Backup Cashew Pieces", "Ingredient", 512, "lb", "1 pallet", "Alternative supplier option."),
  line("long_lead_cacao_nibs", "supplier_long_lead_cacao", "inventory_long_lead_cacao", "Cacao Nibs", "Ingredient", 645, "lb", "full container", "Long lead time risk."),
  line("long_lead_cacao_powder", "supplier_long_lead_cacao", null, "Cocoa Powder", "Ingredient", 590, "lb", "full container", "Long lead time risk."),
  line("packaging_labels", "supplier_packaging_only", "inventory_zero_stock_labels", "Pressure-Sensitive Labels", "Packaging", 3, "each", "25,000 labels", "High MOQ labels."),
  line("packaging_lids", "supplier_packaging_only", "inventory_tamper_lids", "Tamper-Evident Lids", "Packaging", 18, "each", "10,000 lids", "Packaging-only vendor."),
  line("missing_contact_almond", "supplier_missing_contact", "inventory_almond_cold_chain", "Almond Paste", "Ingredient", 460, "lb", null, "Missing contact info example."),
  line("allergen_sesame", "supplier_allergen_sensitive", "inventory_sesame_allergen", "Toasted Sesame Seeds", "Ingredient", 275, "lb", "40 cases", "Allergen note example."),
  line("archived_broker_spot", "supplier_archived_broker", null, "Spot Market Peanut Butter Base", "Ingredient", 320, "lb", "spot buy", "Archived supplier line."),
  line("cold_chain_almonds", "supplier_cold_chain", "inventory_almond_cold_chain", "Chilled Almond Butter", "Ingredient", 675, "lb", "1 refrigerated truck", "Cold-chain item."),
  line("domestic_jars_12oz", "supplier_domestic_jars", "inventory_fully_allocated_jars", "12 oz PET Jar", "Packaging", 42, "each", "12 pallets", "Fast packaging replenishment."),
  line("domestic_jars_24oz", "supplier_domestic_jars", "inventory_24oz_jars", "24 oz PET Jar", "Packaging", 59, "each", "12 pallets", "Larger jar option."),
  line("high_moq_pretzel", "supplier_moq_specialty", "inventory_pretzel_high_moq", "Pretzel Crunch Pieces", "Ingredient", 255, "lb", "10,000 lb", "High MOQ mix-in."),
  line("local_honey_pails", "supplier_local_honey", "inventory_honey_local", "Wildflower Honey Pails", "Ingredient", 395, "lb", "10 pails", "Seasonal small supplier."),
  line("freight_watch_cashews", "supplier_freight_watch", "inventory_cashew_freight", "Cashew Pieces", "Ingredient", 498, "lb", "5 pallets", "Freight watch item."),
  line("freight_watch_sea_salt", "supplier_freight_watch", "inventory_sea_salt", "Fine Sea Salt", "Ingredient", 82, "lb", "1 pallet", "Freight risk contrast."),
];

const MASTER_ITEMS = [
  master("master_roasted_peanuts", "DEMO-MI-001", "Demo Catalog - Roasted Peanuts", "raw_material", "lb", "general", ["peanut"]),
  master("master_peanut_butter_base", "DEMO-MI-002", "Demo Catalog - Peanut Butter Base", "raw_material", "lb", "general", ["peanut"]),
  master("master_almond_butter", "DEMO-MI-003", "Demo Catalog - Almond Butter", "raw_material", "lb", "general", ["tree nut"]),
  master("master_cashew_pieces", "DEMO-MI-004", "Demo Catalog - Cashew Pieces", "raw_material", "lb", "general", ["tree nut"]),
  master("master_cacao_nibs", "DEMO-MI-005", "Demo Catalog - Cacao Nibs", "raw_material", "lb", "general", []),
  master("master_honey", "DEMO-MI-006", "Demo Catalog - Wildflower Honey", "raw_material", "lb", "general", []),
  master("master_sea_salt", "DEMO-MI-007", "Demo Catalog - Fine Sea Salt", "raw_material", "lb", "general", []),
  master("master_pretzel_crunch", "DEMO-MI-008", "Demo Catalog - Pretzel Crunch", "raw_material", "lb", "general", ["wheat"]),
  master("master_sesame_seed", "DEMO-MI-009", "Demo Catalog - Toasted Sesame Seed", "raw_material", "lb", "general", ["sesame"]),
  master("master_12oz_jar", "DEMO-MI-010", "Demo Catalog - 12 oz Jar", "packaging", "each", "general", []),
  master("master_24oz_jar", "DEMO-MI-011", "Demo Catalog - 24 oz Jar", "packaging", "each", "general", []),
  master("master_pressure_label", "DEMO-MI-012", "Demo Catalog - Pressure Label", "packaging", "each", "general", []),
  master("master_tamper_lid", "DEMO-MI-013", "Demo Catalog - Tamper Lid", "packaging", "each", "general", []),
  master("master_shipper_case", "DEMO-MI-014", "Demo Catalog - Shipper Case", "packaging", "each", "general", []),
  master("master_finished_crunch", "DEMO-MI-015", "Demo Catalog - Finished Low Stock Crunch", "finished_good", "case", "customer_demo_1", ["peanut"]),
  master("master_finished_honey", "DEMO-MI-016", "Demo Catalog - Finished Honey Almond", "finished_good", "case", "customer_demo_1", ["tree nut"]),
];

const INVENTORY_ITEMS = [
  inventory("inventory_low_stock_peanuts", "master_roasted_peanuts", "Ingredient", "supplier_preferred_peanuts", "general", 38, 8, 80, "lb", 186, 5, "A1-LOW", "LOT-DEMO-PEANUT-LOW", "low_stock"),
  inventory("inventory_zero_stock_labels", "master_pressure_label", "Packaging", "supplier_packaging_only", "general", 0, 0, 5000, "each", 3, 14, "PKG-ZERO", null, "zero_stock"),
  inventory("inventory_fully_allocated_jars", "master_12oz_jar", "Packaging", "supplier_domestic_jars", "general", 2400, 2400, 1200, "each", 42, 7, "PKG-FULL", "LOT-DEMO-JAR-FULL", "fully_allocated"),
  inventory("inventory_healthy_base", "master_peanut_butter_base", "Ingredient", "supplier_backup_roaster", "general", 1800, 250, 500, "lb", 320, 12, "A2-HEALTHY", "LOT-DEMO-BASE-OK", "healthy_stock"),
  inventory("inventory_long_lead_cacao", "master_cacao_nibs", "Ingredient", "supplier_long_lead_cacao", "general", 95, 15, 160, "lb", 645, 45, "A3-WATCH", "LOT-DEMO-CACAO-WATCH", "low_stock"),
  inventory("inventory_almond_cold_chain", "master_almond_butter", "Ingredient", "supplier_cold_chain", "general", 520, 40, 300, "lb", 675, 18, "COLD-1", "LOT-DEMO-ALMOND-COLD", "healthy_stock"),
  inventory("inventory_cashew_freight", "master_cashew_pieces", "Ingredient", "supplier_freight_watch", "general", 210, 175, 200, "lb", 498, 24, "A4-FREIGHT", "LOT-DEMO-CASHEW-FRT", "tight_available"),
  inventory("inventory_honey_local", "master_honey", "Ingredient", "supplier_local_honey", "general", 125, 0, 50, "lb", 395, 4, "A5-HONEY", "LOT-DEMO-HONEY-LOCAL", "healthy_stock"),
  inventory("inventory_sea_salt", "master_sea_salt", "Ingredient", "supplier_freight_watch", "general", 780, 20, 100, "lb", 82, 24, "A6-SALT", "LOT-DEMO-SALT", "healthy_stock"),
  inventory("inventory_pretzel_high_moq", "master_pretzel_crunch", "Ingredient", "supplier_moq_specialty", "general", 60, 10, 250, "lb", 255, 30, "A7-MOQ", "LOT-DEMO-PRETZEL-MOQ", "low_stock"),
  inventory("inventory_sesame_allergen", "master_sesame_seed", "Ingredient", "supplier_allergen_sensitive", "general", 42, 0, 40, "lb", 275, 9, "ALLERGEN-1", "LOT-DEMO-SESAME", "allergen_watch"),
  inventory("inventory_24oz_jars", "master_24oz_jar", "Packaging", "supplier_domestic_jars", "general", 5400, 1200, 2000, "each", 59, 7, "PKG-24", "LOT-DEMO-24JAR", "healthy_stock"),
  inventory("inventory_tamper_lids", "master_tamper_lid", "Packaging", "supplier_packaging_only", "general", 900, 300, 2500, "each", 18, 14, "PKG-LID", "LOT-DEMO-LID-LOW", "low_stock"),
  inventory("inventory_shipper_cases", "master_shipper_case", "Packaging", "supplier_packaging_only", "general", 120, 80, 200, "each", 118, 14, "PKG-CASE", "LOT-DEMO-CASE-LOW", "low_stock"),
  inventory("inventory_finished_crunch", "master_finished_crunch", "Finished Good", null, "customer_demo_1", 12, 12, 24, "case", 1899, null, "FG-CRUNCH", "FG-DEMO-CRUNCH", "fully_allocated"),
  inventory("inventory_finished_honey", "master_finished_honey", "Finished Good", null, "customer_demo_1", 68, 10, 24, "case", 2199, null, "FG-HONEY", "FG-DEMO-HONEY", "healthy_stock"),
];

const PRODUCTS = [
  product("product_low_stock_crunch", "DEMO-PROD-001", "Demo Catalog - Low Stock Crunch", "customer_demo_1", "active", "Squeeze Pack", 12, "oz", 12, "Low Stock Demo", 899, true, true, "Contains peanuts", 220, "Primary product tied to low-stock ingredient and fully allocated finished good."),
  product("product_zero_label_butter", "DEMO-PROD-002", "Demo Catalog - Zero Label Butter", "customer_demo_1", "active", "Bnutty", 16, "oz", 6, "Zero Label Demo", 999, false, true, "Contains peanuts", 160, "Uses labels with zero on-hand inventory."),
  product("product_honey_almond", "DEMO-PROD-003", "Demo Catalog - Honey Almond", "customer_demo_1", "active", "Main", 24, "oz", 6, "Seasonal Honey", 1299, true, true, "Contains tree nuts", 140, "Healthy finished good with seasonal supplier note."),
  product("product_cacao_swirl", "DEMO-PROD-004", "Demo Catalog - Cacao Swirl", "customer_demo_1", "active", "Dog House", 10, "oz", 12, "Long Lead Cacao", 1099, false, true, "Contains peanuts", 90, "Highlights long lead cacao risk."),
  product("product_pretzel_crunch", "DEMO-PROD-005", "Demo Catalog - Pretzel Crunch", "customer_demo_1", "active", "Squeeze Pack", 14, "oz", 12, "High MOQ Pretzel", 1199, false, true, "Contains wheat and peanuts", 120, "Uses high MOQ mix-in that is below reorder."),
  product("product_sesame_test", "DEMO-PROD-006", "Demo Catalog - Sesame Test Batch", null, "active", "Main", 8, "oz", 24, "Allergen Watch", 799, false, true, "Contains sesame", 60, "General internal dummy product for allergen handling."),
  product("product_inactive_legacy", "DEMO-PROD-007", "Demo Catalog - Inactive Legacy Butter", "customer_demo_1", "inactive", "Bnutty", 18, "oz", 6, "Legacy", 799, false, true, "Contains peanuts", null, "Inactive product example."),
  product("product_missing_optional", "DEMO-PROD-008", "Demo Catalog - Minimal Setup Product", null, "active", null, null, null, null, null, null, false, false, null, null, "Intentionally sparse optional setup fields."),
  product("product_kosher_plain", "DEMO-PROD-009", "Demo Catalog - Kosher Plain Peanut", "customer_demo_1", "active", "Main", 12, "oz", 12, "Kosher Plain", 899, true, true, "Contains peanuts", 240, "Kosher baseline product."),
  product("product_non_kosher_mixin", "DEMO-PROD-010", "Demo Catalog - Non-Kosher Mix-In", "customer_demo_1", "active", "Dog House", 11, "oz", 12, "Non-Kosher Mix", 949, false, true, "Contains peanuts and wheat", 100, "Non-kosher comparison product."),
  product("product_large_case", "DEMO-PROD-011", "Demo Catalog - Large Case Club Pack", "customer_demo_1", "active", "Squeeze Pack", 32, "oz", 4, "Club Pack", 1899, true, true, "Contains tree nuts", 75, "Unusual larger size and smaller case quantity."),
  product("product_tiny_trial", "DEMO-PROD-012", "Demo Catalog - Tiny Trial Cup", null, "active", "Main", 1.5, "oz", 48, "Trial Cup", 199, false, true, "Contains peanuts", 500, "Very small unit size demo product."),
  product("product_no_allergen", "DEMO-PROD-013", "Demo Catalog - No Allergen Packaging Kit", null, "active", null, 1, "kit", 1, "Packaging Kit", 299, false, false, null, null, "Packaging-only style product without allergen flag."),
  product("product_high_rate", "DEMO-PROD-014", "Demo Catalog - High Rate Classic", "customer_demo_1", "active", "Bnutty", 16, "oz", 12, "High Rate", 999, true, true, "Contains peanuts", 900, "High daily production rate example."),
  product("product_low_rate_specialty", "DEMO-PROD-015", "Demo Catalog - Low Rate Specialty", "customer_demo_1", "active", "Dog House", 9, "oz", 8, "Low Rate", 1499, false, true, "Contains sesame and tree nuts", 25, "Low daily production rate specialty example."),
  product("product_archived_supplier_ref", "DEMO-PROD-016", "Demo Catalog - Archived Supplier Reference", null, "active", "Main", 13, "oz", 12, "Archived Supplier", 999, false, true, "Contains peanuts", 80, "Product notes reference archived supplier sourcing history."),
  product("product_cold_chain", "DEMO-PROD-017", "Demo Catalog - Cold Chain Almond Cup", "customer_demo_1", "active", "Main", 6, "oz", 24, "Cold Chain", 699, true, true, "Contains tree nuts", 180, "Uses refrigerated almond ingredient."),
  product("product_freight_watch", "DEMO-PROD-018", "Demo Catalog - Freight Watch Cashew", "customer_demo_1", "active", "Squeeze Pack", 15, "oz", 12, "Freight Watch", 1299, false, true, "Contains tree nuts", 110, "Uses freight-watch cashews."),
  product("product_label_heavy", "DEMO-PROD-019", "Demo Catalog - Label Heavy Promo", "customer_demo_1", "active", "Bnutty", 4, "oz", 36, "Promo Label", 499, false, true, "Contains peanuts", 320, "Uses extra label quantity in BOM."),
  product("product_finished_good_demo", "DEMO-PROD-020", "Demo Catalog - Finished Good Repack", "customer_demo_1", "active", "Main", 20, "oz", 6, "Finished Good", 1599, true, true, "Contains peanuts", 95, "Includes finished-good inventory example."),
];

const BOM_MASTER_IDS = MASTER_ITEMS.map((item) => item.id);

export function demoCatalogSummary() {
  return {
    prefix: DEMO_CATALOG_PREFIX,
    database: DEFAULT_DATABASE,
    counts: {
      suppliers: SUPPLIERS.length,
      supplierProductLines: SUPPLIER_LINES.length,
      products: PRODUCTS.length,
      masterItems: MASTER_ITEMS.length,
      inventoryItems: INVENTORY_ITEMS.length,
      productBomItems: PRODUCTS.length * 2,
    },
    edgeCases: [
      "low_stock",
      "zero_stock",
      "fully_allocated",
      "healthy_stock",
      "long_lead_time_supplier",
      "archived_supplier",
      "inactive_product",
    ],
  };
}

export function generateDemoCatalogSql() {
  const lines = [
    "-- Staging demo catalog seed.",
    "-- Dummy namespaced data only. Additive INSERT OR IGNORE statements; no deletes or production data import.",
    "PRAGMA foreign_keys = ON;",
  ];

  lines.push(sqlInsert("customers", {
    id: "customer_demo_1",
    name: "Customer Demo 1",
    contact_name: "Customer Demo 1",
    contact_email: "customer_demo_1@staging.nuthouse.local",
    status: "active",
  }));

  for (const supplierRecord of SUPPLIERS) {
    lines.push(sqlInsert("suppliers", {
      id: supplierRecord.id,
      module: "supplier",
      kind: "supplier",
      title: supplierRecord.title,
      status: supplierRecord.status,
      payload_json: JSON.stringify(supplierRecord.payload),
      file_ids_json: "[]",
    }));
  }

  for (const supplierLine of SUPPLIER_LINES) {
    lines.push(sqlInsert("supplier_product_lines", supplierLine));
  }

  for (const masterItem of MASTER_ITEMS) {
    lines.push(sqlInsert("master_items", {
      id: masterItem.id,
      sku: masterItem.sku,
      name: masterItem.name,
      item_type: masterItem.itemType,
      unit_of_measure: masterItem.unitOfMeasure,
      customer_id: masterItem.customerId,
      allergens_json: JSON.stringify(masterItem.allergens),
    }));
  }

  for (const inventoryItem of INVENTORY_ITEMS) {
    lines.push(sqlInsert("inventory_items", {
      id: inventoryItem.id,
      master_item_id: inventoryItem.masterItemId,
      category: inventoryItem.category,
      supplier_id: inventoryItem.supplierId,
      customer_id: inventoryItem.customerId,
      on_hand_quantity: inventoryItem.onHandQuantity,
      allocated_quantity: inventoryItem.allocatedQuantity,
      reorder_point_quantity: inventoryItem.reorderPointQuantity,
      unit_of_measure: inventoryItem.unitOfMeasure,
      unit_cost_cents: inventoryItem.unitCostCents,
      lead_time_days: inventoryItem.leadTimeDays,
      location: inventoryItem.location,
      lot_number: inventoryItem.lotNumber,
      lots_json: JSON.stringify([{ lotNumber: inventoryItem.lotNumber ?? "NO-LOT", quantity: inventoryItem.onHandQuantity, edgeCase: inventoryItem.edgeCase }]),
    }));
  }

  for (const productRecord of PRODUCTS) {
    lines.push(sqlInsert("products", {
      id: productRecord.id,
      customer_id: productRecord.customerId,
      sku: productRecord.sku,
      name: productRecord.name,
      description: productRecord.description,
      status: productRecord.status,
      production_room: productRecord.productionRoom,
      size: productRecord.size,
      size_unit: productRecord.sizeUnit,
      case_quantity: productRecord.caseQuantity,
      case_sticker: productRecord.caseSticker,
      unit_price_cents: productRecord.unitPriceCents,
      kosher: productRecord.kosher ? 1 : 0,
      allergen: productRecord.allergen ? 1 : 0,
      allergen_details: productRecord.allergenDetails,
      daily_production_rate: productRecord.dailyProductionRate,
      notes: productRecord.notes,
    }));
  }

  for (const bomItem of buildBomItems()) {
    lines.push(sqlInsert("product_bom_items", bomItem));
  }

  return `${lines.join("\n\n")}\n`;
}

export function parseArgs(argv) {
  const options = {
    database: DEFAULT_DATABASE,
    execute: false,
    remote: false,
    local: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--remote") options.remote = true;
    else if (arg === "--local") options.local = true;
    else if (arg === "--database") options.database = argv[++index] ?? "";
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.local && options.remote) throw new Error("Use either --local or --remote, not both.");
  if (options.execute && !options.local && !options.remote) throw new Error("Use --execute with --remote or --local.");
  if (!options.execute && options.remote) throw new Error("Use --remote only with --execute.");
  if (!options.execute && options.local) throw new Error("Use --local only with --execute.");
  if (options.database !== DEFAULT_DATABASE) {
    throw new Error(`Remote demo catalog seeding is limited to ${DEFAULT_DATABASE}.`);
  }
  return options;
}

export function buildExecutionCommand(options, file = "<generated-sql-file>") {
  const args = ["wrangler", "d1", "execute", options.database, "--file", file];
  if (options.remote) args.push("--remote");
  if (options.local) args.push("--local");
  return args;
}

export function usage() {
  return [
    `Usage: npm run sample:catalog -- [--execute --remote|--local] [--database ${DEFAULT_DATABASE}]`,
    "",
    "Default mode prints a SQL preview only.",
    `Remote execution is hard-limited to ${DEFAULT_DATABASE} and still requires General approval.`,
  ].join("\n");
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const summary = demoCatalogSummary();
  const sql = generateDemoCatalogSql();
  console.log("Staging demo catalog:");
  console.log(`- Prefix: ${summary.prefix}`);
  console.log(`- Database: ${summary.database}`);
  console.log(`- Suppliers: ${summary.counts.suppliers}`);
  console.log(`- Supplier lines: ${summary.counts.supplierProductLines}`);
  console.log(`- Products: ${summary.counts.products}`);
  console.log(`- Master items: ${summary.counts.masterItems}`);
  console.log(`- Inventory items: ${summary.counts.inventoryItems}`);
  console.log(`- BOM rows: ${summary.counts.productBomItems}`);
  console.log(`- Edge cases: ${summary.edgeCases.join(", ")}`);

  if (!options.execute) {
    console.log("\nSQL preview:");
    console.log(sql);
    return 0;
  }

  const dir = mkdtempSync(join(tmpdir(), "nut-house-demo-catalog-"));
  const file = join(dir, "sample-demo-catalog.sql");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    const result = spawnSync("npx", buildExecutionCommand(options, file), {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    return result.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function supplier(id, title, status, payload) {
  return { id: prefixed(id), title, status, payload: { demo: true, stagingOnly: true, ...payload } };
}

function line(id, supplierId, inventoryItemId, productName, productType, pricePerUnitCents, unitOfMeasure, moq, notes) {
  return {
    id: prefixed(`supplier_line_${id}`),
    supplier_id: prefixed(supplierId),
    inventory_item_id: inventoryItemId ? prefixed(inventoryItemId) : null,
    product_name: productName,
    product_type: productType,
    price_per_unit_cents: pricePerUnitCents,
    unit_of_measure: unitOfMeasure,
    moq,
    notes,
  };
}

function master(id, sku, name, itemType, unitOfMeasure, customerId, allergens) {
  return { id: prefixed(id), sku, name, itemType, unitOfMeasure, customerId, allergens };
}

function inventory(id, masterItemId, category, supplierId, customerId, onHandQuantity, allocatedQuantity, reorderPointQuantity, unitOfMeasure, unitCostCents, leadTimeDays, location, lotNumber, edgeCase) {
  return {
    id: prefixed(id),
    masterItemId: prefixed(masterItemId),
    category,
    supplierId: supplierId ? prefixed(supplierId) : null,
    customerId,
    onHandQuantity,
    allocatedQuantity,
    reorderPointQuantity,
    unitOfMeasure,
    unitCostCents,
    leadTimeDays,
    location,
    lotNumber,
    edgeCase,
  };
}

function product(id, sku, name, customerId, status, productionRoom, size, sizeUnit, caseQuantity, caseSticker, unitPriceCents, kosher, allergen, allergenDetails, dailyProductionRate, notes) {
  return {
    id: prefixed(id),
    sku,
    name,
    customerId,
    description: `Dummy staging-only product: ${notes}`,
    status,
    productionRoom,
    size,
    sizeUnit,
    caseQuantity,
    caseSticker,
    unitPriceCents,
    kosher,
    allergen,
    allergenDetails,
    dailyProductionRate,
    notes,
  };
}

function buildBomItems() {
  return PRODUCTS.flatMap((productRecord, productIndex) => {
    const first = BOM_MASTER_IDS[productIndex % BOM_MASTER_IDS.length];
    const second = BOM_MASTER_IDS[(productIndex + 5) % BOM_MASTER_IDS.length];
    return [
      {
        id: prefixed(`bom_${String(productIndex + 1).padStart(2, "0")}_primary`),
        product_id: productRecord.id,
        master_item_id: first,
        quantity_per_unit: Number((1.25 + productIndex * 0.1).toFixed(2)),
        percent_of_formula: productIndex % 4 === 0 ? null : Number((55 + (productIndex % 5) * 5).toFixed(2)),
      },
      {
        id: prefixed(`bom_${String(productIndex + 1).padStart(2, "0")}_support`),
        product_id: productRecord.id,
        master_item_id: second,
        quantity_per_unit: Number((0.25 + productIndex * 0.03).toFixed(2)),
        percent_of_formula: productIndex % 3 === 0 ? null : Number((8 + (productIndex % 4) * 3).toFixed(2)),
      },
    ];
  });
}

function prefixed(id) {
  return `${DEMO_CATALOG_PREFIX}_${id}`;
}

function sqlInsert(table, values) {
  const columns = Object.keys(values);
  return `INSERT OR IGNORE INTO ${table} (${columns.join(", ")})\nVALUES (${columns.map((column) => sqlValue(values[column])).join(", ")});`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${escapeSql(value)}'`;
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runCli();
}
