# Nut House ERP Design System

## Product Context

Nut House ERP is an internal operations system for a food manufacturing and co-packing business. The application is used by employees and admins to move work through purchase orders, supply chain review, product setup, inventory, procurement, production, quality assurance, shipping, pick and pack, customer records, and related operational logs.

The interface should feel like a dependable warehouse and production control room. It is not a marketing site, consumer app, or decorative SaaS landing page. The product should be calm, information-dense, practical, and easy to scan during repeated daily use.

The current implementation is a single-file HTML/CSS/JavaScript application served through a Cloudflare Worker. Stitch designs should preserve that operational feel while improving structure, spacing, clarity, and form usability.

## Design North Star

Design every screen around fast operational decisions:

- What needs attention?
- What record is being worked on?
- What is blocked, low, late, short, or ready?
- What is the next safe action?
- Is this backend data, local/demo fallback data, or unavailable data?

The design should help Nut House staff understand status at a glance, then drill into forms and logs without feeling like they are inside a tutorial or wizard.

## Visual Personality

Use a warm industrial operations style:

- Practical, grounded, and steady.
- Food-production appropriate, not playful or ornamental.
- Dense but not cramped.
- Warm brand cues from Nut House brown/orange, balanced with neutral surfaces.
- Status colors are functional and restrained.
- Tables, logs, forms, and panels are the primary visual language.

Avoid:

- Large marketing-style hero sections.
- Oversized decorative cards.
- Card-inside-card layouts.
- Decorative gradient blobs, orbs, bokeh, or abstract backgrounds.
- UI that looks like a generic analytics dashboard detached from warehouse work.
- Overuse of beige/brown/orange to the point where status and hierarchy become muddy.

## Color System

Use the existing Nut House palette as the foundation, but balance it with cleaner neutral surfaces and sharper status colors.

### Brand Colors

- Nut Brown: `#5C3A21`
  - Primary brand anchor.
  - Use for sidebar, headings, key labels, and strong text.
- Deep Brown: `#3E2613`
  - Active navigation and high-emphasis brand areas.
- Soft Brown: `#8B5E3C`
  - Secondary text and subdued metadata.
- Nut Orange: `#E07B2A`
  - Primary actions, active accents, selected states.
- Light Orange: `#F4A261`
  - Hover accents and soft highlights.

### Neutral Colors

- Page Background: `#FAF3E3`
  - Current warm app background.
  - Use sparingly for full-page background only.
- Surface: `#FFFFFF`
  - Main panels, tables, forms, and modals.
- Soft Surface: `#FBFAF8`
  - Modal interiors, grouped form sections, side panels.
- Beige Band: `#F5E9D3`
  - Table headers, filter bars, secondary button fill.
- Border: `#E9E2D2`
  - Default dividers.
- Strong Border: `#C9BFAE`
  - Inputs, compact controls, inactive tabs.
- Text: `#1A1A1A`
  - Body text.

### Semantic Colors

- Success: `#4A7C44`
  - OK, ready, completed, available.
- Warning: `#A0470C`
  - Reorder, attention, pending, needs review.
- Danger: `#B23A3A`
  - Blocked, over-allocated, failed, missing required file.
- Info: `#1E3A8A`
  - Shipping, linked records, non-critical system information.

### Color Usage Rules

- Use brown/orange for brand and navigation, not every surface.
- Use status colors only when they carry operational meaning.
- Low stock and over-allocation must be visually distinct.
- Backend warnings should be calm and low-noise.
- Local/demo fallback status should be visible but not alarming unless the action cannot save.

## Typography

Use system UI typography:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

Typography should prioritize readability and table density.

Recommended scale:

- Page title: 20px, 700 weight.
- Section title: 18px, 700 weight.
- Panel title: 16px, 700 weight.
- Body text: 14px, 400 weight.
- Table text: 13px, 400 weight.
- Table header: 12px or 13px, 600 weight.
- Metadata/help text: 12px, 400 weight.
- Badge text: 11px, 600 weight, uppercase only for short status labels.

Rules:

- Do not use hero-scale type inside dashboards, tables, forms, or operational panels.
- Avoid negative letter spacing.
- Use uppercase labels only for compact field labels and badges.
- Helper text should be plain and short.

## Layout Principles

### App Shell

Keep the current app shell pattern:

- Fixed left sidebar for major modules.
- Sticky topbar with current page title and date/status utilities.
- Main content area with page-level padding.
- Tables and forms inside full-width operational panels.

Sidebar:

- Width: about 240px on desktop.
- Background: Nut Brown.
- Active item: Deep Brown background with Nut Orange accent.
- Use compact vertical spacing.
- Keep module names visible, not icon-only.

Topbar:

- White surface.
- Light border bottom.
- Page title on left.
- Utility/date/context on right.
- Do not overload with page-specific actions.

Content:

- Desktop padding: 24px.
- Mobile padding: 14px to 16px.
- Use full-width panels for workflows.
- Avoid floating page sections that look detached from the app shell.

### Density

This is an operations app. Prefer dense, organized layouts over airy marketing spacing.

- Use compact tables.
- Keep action buttons near the data they affect.
- Keep filters and summary stats above the active table.
- Make records scannable by ID, status, customer, item, date, and next action.

## Shape, Radius, and Elevation

Use restrained shapes:

- Buttons: 6px radius.
- Inputs/selects: 5px radius.
- Cards/panels: 8px radius preferred.
- Large modals: 8px radius.
- Small badges/pills: 999px radius allowed only for compact status chips.

Elevation:

- Use subtle borders first.
- Use shadows only for modals and light panel separation.
- Default panel shadow should be low: `0 1px 3px rgba(0,0,0,0.05)`.
- Modal shadow may be stronger: `0 10px 40px rgba(0,0,0,0.25)`.

## Core Components

### Buttons

Primary button:

- Nut Orange background.
- White text.
- 36px minimum height.
- Use for the main action on a screen or modal.

Secondary button:

- Beige background.
- Brown text.
- Border.
- Use for export, cancel, view, and lower-priority actions.

Dark button:

- Nut Brown background.
- White text.
- Use for durable external/reference actions such as "View Sheet" only when needed.

Danger button:

- Danger red background.
- White text.
- Use for destructive actions only.

Icon buttons:

- Use when the action is compact and familiar: edit, delete, download, upload, view.
- Prefer clear icons plus tooltips.
- Avoid obscure symbolic text where a real icon could be used in implementation.

### Tables

Tables are the primary record surface.

Table rules:

- Header background: Beige Band.
- Sticky headers when table content scrolls.
- 13px body text.
- 10px vertical cell padding on desktop.
- Row hover: light warm surface.
- Keep actions in the rightmost column.
- Use status badges, not long prose, inside status columns.
- Show empty values as a subdued dash.

Table cells should favor:

- Strong primary record name or ID.
- Short metadata below primary text when useful.
- Pills for lots, locations, statuses, and categories.
- Right-aligned numeric quantities where comparison matters.

### Tabs

Use tabs for sibling workflow states inside one module.

Inventory tabs:

- Finished Goods
- Ingredients
- Packaging
- Master List
- Receiving Log
- Move Log
- Shipping Log

Tab rules:

- Active tab should be visually clear.
- Include counts when they help operational scanning.
- Keep tab labels short.
- Do not hide essential workflows behind dropdowns on desktop.
- On mobile, tabs may horizontally scroll.

### Status Badges

Use compact badges for operational status:

- OK
- Reorder
- Low Stock
- Over-allocated
- Pending
- Ready
- Blocked
- Complete

Status labels should be short and consistent. Do not use sentence-length badges.

### Forms and Modals

Use modals for create/edit flows. Do not convert Sprint 5 inventory work into a guided wizard.

Modal structure:

- Clear title.
- Optional one-line context under title when needed.
- Group related fields into sections.
- Two-column form grid on desktop.
- Single-column on mobile.
- Sticky or clearly visible footer actions for long forms when possible.

Form section pattern:

- Section title.
- Short helper text only if the relationship is not obvious.
- Fields arranged by the order users think about the record.

Field rules:

- Labels can be uppercase, 12px, 600 weight.
- Required fields should be visually indicated.
- Derived/autofilled fields should be marked as read-only or "from Master List".
- Validation messages should appear near the field.

## Data-State Messaging

Backend-connected success banners are no longer needed in the normal app flow.

Local/demo fallback:

- Warning treatment, but not frightening.
- Copy: "Showing local demo data. Changes may not be saved to the backend."

Backend unavailable:

- Warning/error treatment.
- Copy: "Backend data is unavailable. Local demo data remains visible so the workflow can still be reviewed."

Auth required:

- Neutral warning.
- Copy: "Sign in as an employee/admin to load and save backend records."

These banners should not dominate the screen. They should sit above the workflow panel and use compact height.

## Inventory Design Direction

Inventory is the first major area to rework in Stitch. The design should make the relationship between Master List, Inventory Items, Receiving, Moves, and Dashboard signals obvious without turning the UI into training material.

### Inventory Mental Model

- Master List defines what an item is.
- Inventory Items track stock for Master List items.
- Receiving Log records inbound stock.
- Move Log records internal movement between locations.
- Shipping Log is generated from Shipping and should remain read-only here.
- Dashboard shows signals derived from inventory health.

### Inventory Page Structure

Recommended page structure:

1. Compact backend/local data-state banner.
2. Inventory summary strip.
3. Tabs.
4. Active-tab toolbar with search/filter/actions.
5. Main table.
6. Empty state or inline issue states.

Summary strip:

- Low stock count.
- Over-allocated count.
- Net available issues.
- Receipts today.
- Moves today.

Keep the strip compact. Use small metric cells, not large dashboard cards.

### Finished Goods Tab

Purpose:

Track completed sellable inventory that can be shipped, stocked, picked, or packed.

Recommended columns:

- Item
- SKU or linked product
- Customer
- Lot(s)
- On Hand
- Allocated
- Net Available
- Unit
- Reorder At
- Locations
- Status
- Actions

Copy:

- Use "Finished Goods" for the tab.
- In product forms, avoid "auto for Bnutty / Poochie Butter".
- Preferred product field label: "Linked Finished Good Inventory Item".
- Preferred helper text: "Choose the inventory item that should increase when this product is completed in production. Leave blank to create or link it later."

Business-rule note:

- If only some brands should auto-increase finished goods, show that as a configurable production behavior, not as a hard-coded field label.

### Ingredients Tab

Purpose:

Track raw materials and production ingredients.

Recommended columns:

- Item
- Lot(s)
- Supplier
- Customer or General
- On Hand
- Allocated
- Net Available
- Unit
- Reorder At
- Lead Time
- CoA
- Locations
- Status
- Actions

Important behavior:

- CoA upload appears here.
- Low stock and over-allocation must be easy to see.
- Allocation should distinguish Supply Chain review demand from Production demand when shown.

### Packaging Tab

Purpose:

Track jars, lids, labels, pouches, cases, and other packaging inventory.

Recommended columns:

- Item
- Lot(s)
- Supplier
- Customer or General
- On Hand
- Allocated
- Net Available
- Unit
- Reorder At
- Lead Time
- Locations
- Status
- Actions

Packaging should look parallel to Ingredients, but without CoA unless the business later requires it.

### Master List Tab

Purpose:

Define item records that can become inventory items or formula/BOM components.

Recommended columns:

- Item Name
- Type
- Unit of Measure
- Allergens
- Customer Scope
- Used In
- Status
- Actions

Screen copy:

"Master List is the source of truth for item definitions. Add raw materials, packaging, finished goods, and other stocked items here before creating inventory records or product formulas."

Do not make this feel like stock. It is definitions and setup.

### Receiving Log Tab

Purpose:

Record inbound inventory receipts with generated `RCV-*` IDs.

Recommended columns:

- Receiving ID
- Date
- Time
- Item
- Lot #
- Packages
- Qty / Package
- Total Qty
- Unit
- Allergen
- Received By
- Carrier
- Vendor
- Actions

Modal behavior:

- Item is selected from Master List.
- Unit and allergen autofill from Master List.
- Total Qty is calculated from Packages times Qty / Package.
- Generated Receiving ID should be visible and read-only.

### Move Log Tab

Purpose:

Record movement between warehouse, production, dock, and storage locations with generated `MV-*` IDs.

Recommended columns:

- Move ID
- Date
- Receiving ID
- Item
- Lot #
- Case Count
- Qty / Case
- Qty Moved
- Unit
- Moved By
- From Location
- To Location
- Actions

Modal behavior:

- Receiving ID selection should autofill item, lot, and unit when possible.
- Qty Moved is calculated from Case Count times Qty / Case.
- From and To locations should be selectable, with a compact "add new location" option.

### Shipping Log Tab

Purpose:

Show shipment records generated from the Shipping workflow.

Rules:

- Read-only inside Inventory.
- Do not add manual shipping log creation here.
- Include a clear empty state if no shipments exist.

## Product Setup Design Direction

Product setup should remain inside the Products area, not become a new wizard.

Product list should support:

- Product image.
- SKU.
- Name.
- Customer.
- Production room.
- Size.
- Case quantity.
- Case sticker.
- Daily rate.
- Kosher.
- Allergen.
- Nutrition Facts Panel.
- Formula/BOM.
- Price.
- Actions.

Product modal should group fields:

1. Product Identity
   - SKU
   - Name
   - Customer
   - Status
2. Production Details
   - Production room
   - Size and unit
   - Daily production rate
   - Case quantity
   - Case sticker
3. Compliance and Labels
   - Kosher
   - Allergen flag
   - Allergen details
   - Nutrition Facts Panel upload
4. Inventory Link
   - Linked Finished Good Inventory Item
5. Formula / Bill of Materials
   - Master List item
   - Quantity per unit
   - Percent of formula
6. Media and Notes
   - Product Image upload
   - Notes

Avoid long training text. Use concise helper text only where the workflow relationship matters.

## Dashboard Design Direction

Dashboard should show operational signals, not broad analytics.

Inventory-related dashboard signals:

- Inventory Status metric.
- Low Stock Alerts table.
- Over-allocation if present.
- Net Available issues if present.

Dashboard cards should be compact and action-linked. "Manage Inventory" should navigate to Inventory with the relevant issue context when possible.

## Copy Guidelines

Use plain operational language.

Prefer:

- "Linked Finished Good Inventory Item"
- "Receiving ID"
- "Move ID"
- "Net Available"
- "Reorder At"
- "Source item from Master List"
- "Showing local demo data"

Avoid:

- "Increment FG"
- "Auto for Bnutty / Poochie Butter"
- "Magical" automation language.
- Long explanations inside table views.
- Internal implementation details in labels.

Business rules that are not fully confirmed should be phrased as configuration or admin behavior, not fixed facts.

## Accessibility and Responsiveness

Minimum expectations:

- Visible focus states on buttons, inputs, selects, tabs, and modal close controls.
- Sufficient color contrast for text and badges.
- Status should not rely on color alone.
- Modal close button should be large enough to tap.
- Tables should horizontally scroll on small screens.
- Important mobile table flows may become compact record cards when a table is too dense.
- Do not allow text to overflow buttons, badges, or table cells in a way that hides meaning.

## Stitch Generation Guidance

When generating screens in Google Stitch:

- Preserve the left-sidebar ERP shell.
- Preserve the warm Nut House brand foundation.
- Make workflow panels cleaner and more structured.
- Use dense tables and compact summary strips.
- Use realistic operations data.
- Keep actions and filters close to their active table.
- Keep modals grouped and practical.
- Show backend/local data-state banners.
- Do not redesign into a landing page, marketing dashboard, or consumer app.

For the inventory redesign, generate the actual working ERP screens:

- Inventory main screen with all tabs.
- Ingredients table with low stock and CoA states.
- Master List screen.
- Add/Edit Inventory Item modal.
- Receiving Log screen and modal.
- Move Log screen and modal.
- Product Add/Edit modal with the improved Finished Good wording.

## Quality Bar

A good Stitch output for this app should feel like:

- A real staff member could use it during a production day.
- Important stock problems are visible immediately.
- The difference between definitions, stock, receipts, and moves is clear.
- The UI does not over-teach.
- The UI does not hide operational risk.
- The screen remains believable for the existing single-file ERP implementation.
