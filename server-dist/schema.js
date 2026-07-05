import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
// Currencies table
export const currencies = sqliteTable('currencies', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Exchange rates table
export const exchangeRates = sqliteTable('exchange_rates', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    currencyId: integer('currency_id').notNull().references(() => currencies.id, { onDelete: 'cascade' }),
    rateToBase: real('rate_to_base').notNull(),
    effectiveDate: integer('effective_date', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
    source: text('source').notNull().default('manual'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Settings table
export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    settingKey: text('setting_key').notNull().unique(),
    settingValue: text('setting_value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Materials table
export const materials = sqliteTable('materials', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    sku: text('sku'),
    description: text('description'),
    materialType: text('material_type').notNull().default('primary'),
    category: text('category').notNull(),
    unit: text('unit').notNull(),
    bulkQuantity: real('bulk_quantity').notNull(),
    bulkPrice: real('bulk_price').notNull(),
    purchaseCurrencyId: integer('purchase_currency_id').notNull().references(() => currencies.id),
    priceInPurchaseCurrency: real('price_in_purchase_currency').notNull(),
    priceInBaseCurrency: real('price_in_base_currency').notNull(),
    unitPrice: real('unit_price').notNull(),
    overheadPercentage: real('overhead_percentage').notNull().default(0),
    marginPercentage: real('margin_percentage').notNull().default(0),
    intermediateCostMode: text('intermediate_cost_mode').notNull().default('yield'),
    yieldPercentage: real('yield_percentage').notNull().default(100),
    calculatedCostPerUnit: real('calculated_cost_per_unit').notNull().default(0),
    supplier: text('supplier').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
export const intermediateMaterialBom = sqliteTable('intermediate_material_bom', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    intermediateMaterialId: integer('intermediate_material_id').notNull().references(() => materials.id, { onDelete: 'cascade' }),
    componentMaterialId: integer('component_material_id').notNull().references(() => materials.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Products table
export const products = sqliteTable('products', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    sku: text('sku'),
    description: text('description'),
    category: text('category'),
    overheadPercentage: real('overhead_percentage').notNull(),
    profitMargin: real('profit_margin').notNull(),
    otherDirectCosts: real('other_direct_costs').notNull().default(0),
    productionMode: text('production_mode').default('single'),
    batchYield: real('batch_yield').default(1),
    currentSellingPrice: real('current_selling_price').default(0),
    approvalStatus: text('approval_status').notNull().default('pending'),
    approvedPrice: real('approved_price'),
    approvedBy: text('approved_by'),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    approvedPriceExpiresAt: text('approved_price_expires_at'),
    priceExpiryNotifiedAt: text('price_expiry_notified_at'),
    needsReviewReason: text('needs_review_reason'),
    // DEPRECATED: This column was used by the Reject feature removed in v1.0.32.
    // Reject was replaced with Reset to Pending. This column is no longer written to
    // or read by any part of the application. It is kept to avoid a destructive migration
    // on existing user databases. Remove in a future major version with a full migration.
    rejectionReason: text('rejection_reason'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
export const priceLevels = sqliteTable('price_levels', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    multiplier: real('multiplier').notNull().default(1),
    adjustmentType: text('adjustment_type').notNull().default('discount'),
    adjustmentPercentage: real('adjustment_percentage').notNull().default(0),
    description: text('description'),
    currencyId: integer('currency_id').references(() => currencies.id, { onDelete: 'set null' }),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `CURRENT_TIMESTAMP`),
});
export const priceLevelItems = sqliteTable('price_level_items', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    priceLevelId: integer('price_level_id')
        .notNull()
        .references(() => priceLevels.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
    overrideType: text('override_type').notNull().default('rule_discount'),
    adjustmentPercentage: real('adjustment_percentage'),
    customPrice: real('custom_price'),
    status: text('status').notNull().default('pending'),
    approvedBy: text('approved_by'),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    justification: text('justification'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql `(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .default(sql `(unixepoch())`),
});
export const priceLevelPackSizes = sqliteTable('price_level_pack_sizes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    priceLevelItemId: integer('price_level_item_id')
        .notNull()
        .references(() => priceLevelItems.id, { onDelete: 'cascade' }),
    packQuantity: integer('pack_quantity').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql `(unixepoch())`),
});
export const customers = sqliteTable('customers', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    allowSpecialPricing: integer('allow_special_pricing', { mode: 'boolean' }).notNull().default(false),
    priceLevelId: integer('price_level_id').notNull().references(() => priceLevels.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
export const specialPricing = sqliteTable('special_pricing', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    customPrice: real('custom_price').notNull(),
    productionCost: real('production_cost'),
    marginImpactPercentage: real('margin_impact_percentage'),
    oldMarginPercentage: real('old_margin_percentage'),
    overrideType: text('override_type').notNull().default('custom'),
    discountPercentage: real('discount_percentage'),
    markupPercentage: real('markup_percentage'),
    status: text('status').notNull().default('pending'),
    approvedBy: text('approved_by'),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    justification: text('justification'),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Bill of Materials table
export const billOfMaterials = sqliteTable('bill_of_materials', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    materialId: integer('material_id').notNull().references(() => materials.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Material price history table
export const materialPriceHistory = sqliteTable('material_price_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    materialId: integer('material_id').notNull().references(() => materials.id, { onDelete: 'cascade' }),
    purchaseCurrencyId: integer('purchase_currency_id').notNull().references(() => currencies.id),
    priceInPurchaseCurrency: real('price_in_purchase_currency').notNull(),
    priceInBaseCurrency: real('price_in_base_currency').notNull(),
    changedAt: integer('changed_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Price lists table
export const priceLists = sqliteTable('price_lists', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    customerId: integer('customer_id').references(() => customers.id),
    priceLevelId: integer('price_level_id').notNull().references(() => priceLevels.id),
    validFrom: integer('valid_from', { mode: 'timestamp' }).notNull(),
    validUntil: integer('valid_until', { mode: 'timestamp' }),
    status: text('status').notNull().default('draft'),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
// Price list items table
export const priceListItems = sqliteTable('price_list_items', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    priceListId: integer('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id),
    basePrice: real('base_price').notNull(),
    discountPercentage: real('discount_percentage').notNull().default(0),
    finalPrice: real('final_price').notNull(),
    priceSource: text('price_source').notNull().default('base'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
export const activityLog = sqliteTable('activity_log', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    entityName: text('entity_name'),
    action: text('action').notNull(),
    details: text('details'),
    performedBy: text('performed_by'),
    userId: integer('user_id').notNull().default(1),
    userName: text('user_name').notNull().default('Admin'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql `(unixepoch())`),
});
