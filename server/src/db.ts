import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
import { seedDemoData } from './seedDemo.js';
import { migrateActivityLog } from './migrations/add-user-id-to-activity-log.js';
import { migratePriceLevelCurrency } from './migrations/add-currency-to-price-levels.js';
import { migratePriceLevelPackSizes } from './migrations/add-price-level-pack-sizes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isElectron = process.env.ELECTRON === 'true';
const userDataPath = process.env.USER_DATA_PATH;

// In Electron: use AppData folder (writable after install).
// In dev: keep database files under the server root directory.
const dbRootDir = isElectron && userDataPath
	? userDataPath
	: path.resolve(__dirname, '..');

if (!fs.existsSync(dbRootDir)) {
	fs.mkdirSync(dbRootDir, { recursive: true });
}

export const DATABASE_FILE_PATH = path.resolve(dbRootDir, 'priceright.db');
export const DEMO_DATABASE_FILE_PATH = path.resolve(dbRootDir, 'demo.db');
export const DEMO_MODE_FILE_PATH = path.resolve(dbRootDir, 'demo-mode.json');

let sqlite = new Database(DATABASE_FILE_PATH);
const demoSqlite = new Database(DEMO_DATABASE_FILE_PATH);

sqlite.pragma('foreign_keys = ON');
demoSqlite.pragma('foreign_keys = ON');

function ensureDemoModeFile() {
	if (!fs.existsSync(DEMO_MODE_FILE_PATH)) {
		fs.writeFileSync(DEMO_MODE_FILE_PATH, JSON.stringify({ demoMode: false }, null, 2), 'utf-8');
	}
}

export function readDemoModeState(): boolean {
	ensureDemoModeFile();
	try {
		const raw = fs.readFileSync(DEMO_MODE_FILE_PATH, 'utf-8');
		const parsed = JSON.parse(raw) as { demoMode?: boolean };
		return Boolean(parsed.demoMode);
	} catch {
		fs.writeFileSync(DEMO_MODE_FILE_PATH, JSON.stringify({ demoMode: false }, null, 2), 'utf-8');
		return false;
	}
}

export function writeDemoModeState(demoMode: boolean): boolean {
	ensureDemoModeFile();
	fs.writeFileSync(DEMO_MODE_FILE_PATH, JSON.stringify({ demoMode }, null, 2), 'utf-8');
	return demoMode;
}

function ensureSchemaTables() {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS currencies (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			symbol TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS exchange_rates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
			rate_to_base REAL NOT NULL,
			effective_date INTEGER NOT NULL DEFAULT (unixepoch()),
			source TEXT NOT NULL DEFAULT 'manual',
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			setting_key TEXT NOT NULL UNIQUE,
			setting_value TEXT NOT NULL,
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS materials (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			sku TEXT,
			description TEXT,
			material_type TEXT NOT NULL DEFAULT 'primary',
			category TEXT NOT NULL,
			unit TEXT NOT NULL,
			bulk_quantity REAL NOT NULL,
			bulk_price REAL NOT NULL,
			purchase_currency_id INTEGER NOT NULL REFERENCES currencies(id),
			price_in_purchase_currency REAL NOT NULL,
			price_in_base_currency REAL NOT NULL,
			unit_price REAL NOT NULL,
			overhead_percentage REAL NOT NULL DEFAULT 0,
			margin_percentage REAL NOT NULL DEFAULT 0,
			intermediate_cost_mode TEXT NOT NULL DEFAULT 'yield',
			yield_percentage REAL NOT NULL DEFAULT 100,
			calculated_cost_per_unit REAL NOT NULL DEFAULT 0,
			supplier TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS intermediate_material_bom (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			intermediate_material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
			component_material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
			quantity REAL NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			sku TEXT,
			description TEXT,
			category TEXT,
			overhead_percentage REAL NOT NULL,
			profit_margin REAL NOT NULL,
			other_direct_costs REAL NOT NULL DEFAULT 0,
			production_mode TEXT DEFAULT 'single',
			batch_yield INTEGER DEFAULT 1,
			current_selling_price REAL DEFAULT 0,
			approval_status TEXT NOT NULL DEFAULT 'pending',
			approved_price REAL,
			approved_by TEXT,
			approved_at INTEGER,
			approved_price_expires_at TEXT,
			price_expiry_notified_at TEXT,
			needs_review_reason TEXT,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS bill_of_materials (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
			material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
			quantity REAL NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS material_price_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
			purchase_currency_id INTEGER NOT NULL REFERENCES currencies(id),
			price_in_purchase_currency REAL NOT NULL,
			price_in_base_currency REAL NOT NULL,
			changed_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS price_levels (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			multiplier REAL NOT NULL DEFAULT 1,
			adjustment_type TEXT NOT NULL DEFAULT 'discount',
			adjustment_percentage REAL NOT NULL DEFAULT 0,
			description TEXT,
			is_active INTEGER DEFAULT 1,
			created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS customers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			allow_special_pricing INTEGER NOT NULL DEFAULT 0,
			price_level_id INTEGER NOT NULL REFERENCES price_levels(id),
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS special_pricing (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			customer_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			custom_price REAL NOT NULL,
			production_cost REAL,
			margin_impact_percentage REAL,
			old_margin_percentage REAL,
			override_type TEXT NOT NULL DEFAULT 'custom',
			discount_percentage REAL,
			markup_percentage REAL,
			status TEXT NOT NULL DEFAULT 'pending',
			approved_by TEXT,
			approved_at INTEGER,
			justification TEXT,
			created_by TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			UNIQUE(customer_id, product_id),
			FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS price_lists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			customer_id INTEGER REFERENCES customers(id),
			price_level_id INTEGER NOT NULL REFERENCES price_levels(id),
			valid_from INTEGER NOT NULL,
			valid_until INTEGER,
			status TEXT NOT NULL DEFAULT 'draft',
			created_by TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS price_list_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
			product_id INTEGER NOT NULL REFERENCES products(id),
			base_price REAL NOT NULL,
			discount_percentage REAL NOT NULL DEFAULT 0,
			final_price REAL NOT NULL,
			price_source TEXT NOT NULL DEFAULT 'base',
			notes TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_type TEXT NOT NULL,
			entity_id INTEGER,
			entity_name TEXT,
			action TEXT NOT NULL,
			details TEXT,
			performed_by TEXT,
			user_id INTEGER NOT NULL DEFAULT 1,
			user_name TEXT NOT NULL DEFAULT 'Admin',
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	const createPriceLevelItemsSql = `
		CREATE TABLE IF NOT EXISTS price_level_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			price_level_id INTEGER NOT NULL REFERENCES price_levels(id) ON DELETE CASCADE,
			product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
			override_type TEXT NOT NULL DEFAULT 'rule_discount',
			adjustment_percentage REAL,
			custom_price REAL,
			status TEXT NOT NULL DEFAULT 'pending',
			approved_by TEXT,
			approved_at INTEGER,
			justification TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`;

	sqlite.exec(createPriceLevelItemsSql);

	const createActivityLogSql = `
		CREATE TABLE IF NOT EXISTS activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_type TEXT NOT NULL,
			entity_id INTEGER,
			entity_name TEXT,
			action TEXT NOT NULL,
			details TEXT,
			performed_by TEXT,
			user_id INTEGER NOT NULL DEFAULT 1,
			user_name TEXT NOT NULL DEFAULT 'Admin',
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`;

	sqlite.exec(createActivityLogSql);

	const createMaterialPriceHistorySql = `
		CREATE TABLE IF NOT EXISTS material_price_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			material_id INTEGER NOT NULL,
			purchase_currency_id INTEGER NOT NULL,
			price_in_purchase_currency REAL NOT NULL,
			price_in_base_currency REAL NOT NULL,
			changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
			FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
			FOREIGN KEY (purchase_currency_id) REFERENCES currencies(id)
		)
	`;

	sqlite.exec(createMaterialPriceHistorySql);

	const priceListItemColumns = sqlite
		.prepare("SELECT name FROM pragma_table_info('price_list_items')")
		.all() as Array<{ name: string }>;
	if (!priceListItemColumns.some((column) => column.name === 'price_source')) {
		sqlite.exec("ALTER TABLE price_list_items ADD COLUMN price_source TEXT NOT NULL DEFAULT 'base'");
	}

	const priceLevelColumns = sqlite
		.prepare("SELECT name FROM pragma_table_info('price_levels')")
		.all() as Array<{ name: string }>;
	if (!priceLevelColumns.some((column) => column.name === 'multiplier')) {
		sqlite.exec("ALTER TABLE price_levels ADD COLUMN multiplier REAL");
	}

	sqlite.exec(`
		UPDATE price_levels
		SET multiplier = CASE
			WHEN adjustment_type = 'markup' THEN 1 + (COALESCE(adjustment_percentage, 0) / 100.0)
			ELSE 1 - (COALESCE(adjustment_percentage, 0) / 100.0)
		END
		WHERE multiplier IS NULL
	`);

	const specialPricingFks = sqlite
		.prepare("PRAGMA foreign_key_list(special_pricing)")
		.all() as Array<{ table: string }>;
	const referencesLegacyCustomers = specialPricingFks.some((fk) => fk.table === 'customers_legacy');
	if (referencesLegacyCustomers) {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS special_pricing_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				customer_id INTEGER NOT NULL,
				product_id INTEGER NOT NULL,
				custom_price REAL NOT NULL,
				production_cost REAL,
				margin_impact_percentage REAL,
				old_margin_percentage REAL,
				override_type TEXT NOT NULL DEFAULT 'custom',
				discount_percentage REAL,
				markup_percentage REAL,
				status TEXT NOT NULL DEFAULT 'pending',
				approved_by TEXT,
				approved_at INTEGER,
				justification TEXT,
				created_by TEXT,
				created_at INTEGER NOT NULL DEFAULT (unixepoch()),
				UNIQUE(customer_id, product_id),
				FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
				FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
			)
		`);

		sqlite.exec(`
			INSERT OR IGNORE INTO special_pricing_new (
				id,
				customer_id,
				product_id,
				custom_price,
				production_cost,
				margin_impact_percentage,
				old_margin_percentage,
				override_type,
				discount_percentage,
				markup_percentage,
				status,
				approved_by,
				approved_at,
				justification,
				created_by,
				created_at
			)
			SELECT
				id,
				customer_id,
				product_id,
				custom_price,
				NULL,
				NULL,
				NULL,
				COALESCE(override_type, 'custom'),
				discount_percentage,
				markup_percentage,
				COALESCE(status, 'pending'),
				approved_by,
				approved_at,
				justification,
				created_by,
				created_at
			FROM special_pricing
		`);

		sqlite.exec('DROP TABLE special_pricing');
		sqlite.exec('ALTER TABLE special_pricing_new RENAME TO special_pricing');
	}

	const specialPricingColumns = sqlite
		.prepare("SELECT name FROM pragma_table_info('special_pricing')")
		.all() as Array<{ name: string }>;
	if (!specialPricingColumns.some((column) => column.name === 'production_cost')) {
		sqlite.exec('ALTER TABLE special_pricing ADD COLUMN production_cost REAL');
	}
	if (!specialPricingColumns.some((column) => column.name === 'margin_impact_percentage')) {
		sqlite.exec('ALTER TABLE special_pricing ADD COLUMN margin_impact_percentage REAL');
	}
	if (!specialPricingColumns.some((column) => column.name === 'old_margin_percentage')) {
		sqlite.exec('ALTER TABLE special_pricing ADD COLUMN old_margin_percentage REAL');
	}

	const materialColumns = sqlite
		.prepare("SELECT name FROM pragma_table_info('materials')")
		.all() as Array<{ name: string }>;
	if (!materialColumns.some((column) => column.name === 'material_type')) {
		sqlite.exec("ALTER TABLE materials ADD COLUMN material_type TEXT NOT NULL DEFAULT 'primary'");
	}
	if (!materialColumns.some((column) => column.name === 'overhead_percentage')) {
		sqlite.exec('ALTER TABLE materials ADD COLUMN overhead_percentage REAL NOT NULL DEFAULT 0');
	}
	if (!materialColumns.some((column) => column.name === 'margin_percentage')) {
		sqlite.exec('ALTER TABLE materials ADD COLUMN margin_percentage REAL NOT NULL DEFAULT 0');
	}
	if (!materialColumns.some((column) => column.name === 'intermediate_cost_mode')) {
		sqlite.exec("ALTER TABLE materials ADD COLUMN intermediate_cost_mode TEXT NOT NULL DEFAULT 'yield'");
	}
	if (!materialColumns.some((column) => column.name === 'yield_percentage')) {
		sqlite.exec('ALTER TABLE materials ADD COLUMN yield_percentage REAL NOT NULL DEFAULT 100');
	}
	if (!materialColumns.some((column) => column.name === 'calculated_cost_per_unit')) {
		sqlite.exec('ALTER TABLE materials ADD COLUMN calculated_cost_per_unit REAL NOT NULL DEFAULT 0');
	}
	if (!materialColumns.some((column) => column.name === 'is_active')) {
		sqlite.exec('ALTER TABLE materials ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
	}

	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS intermediate_material_bom (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			intermediate_material_id INTEGER NOT NULL,
			component_material_id INTEGER NOT NULL,
			quantity REAL NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			FOREIGN KEY (intermediate_material_id) REFERENCES materials(id) ON DELETE CASCADE,
			FOREIGN KEY (component_material_id) REFERENCES materials(id) ON DELETE CASCADE
		)
	`);

	const productColumns = sqlite
		.prepare("SELECT name FROM pragma_table_info('products')")
		.all() as Array<{ name: string }>;
	if (!productColumns.some((column) => column.name === 'is_active')) {
		sqlite.exec('ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
	}
	if (!productColumns.some((column) => column.name === 'approved_price_expires_at')) {
		sqlite.exec('ALTER TABLE products ADD COLUMN approved_price_expires_at TEXT');
	}
	if (!productColumns.some((column) => column.name === 'price_expiry_notified_at')) {
		sqlite.exec('ALTER TABLE products ADD COLUMN price_expiry_notified_at TEXT');
	}
	if (!productColumns.some((column) => column.name === 'needs_review_reason')) {
		sqlite.exec('ALTER TABLE products ADD COLUMN needs_review_reason TEXT');
	}
	if (!productColumns.some((column) => column.name === 'rejection_reason')) {
		sqlite.exec('ALTER TABLE products ADD COLUMN rejection_reason TEXT');
	}

	// Performance indexes — created on first run and automatically applied to existing databases
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_products_approval_status ON products(approval_status)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(is_active)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(material_type)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_price_level_items_level_id ON price_level_items(price_level_id)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_price_level_items_product_id ON price_level_items(product_id)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_product_id ON activity_log(entity_id)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action)');
	sqlite.exec('CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)');
}

ensureSchemaTables();
migrateActivityLog(sqlite);
migratePriceLevelCurrency(sqlite);
migratePriceLevelPackSizes(sqlite);
migrateActivityLog(demoSqlite);
migratePriceLevelCurrency(demoSqlite);
migratePriceLevelPackSizes(demoSqlite);

export const db = drizzle(sqlite, { schema });
export const liveDb = db;
export const demoDb = drizzle(demoSqlite, { schema });

export function closeLiveDb(): void {
	try {
		sqlite.close();
	} catch (err) {
		console.error('[db] Error closing liveDb:', err);
	}
}

export function reopenLiveDb(): void {
	try {
		sqlite = new Database(DATABASE_FILE_PATH);
		sqlite.pragma('foreign_keys = ON');
		// Patch the internal session's client so existing Drizzle instance uses the new connection
		(db as any).session.client = sqlite;
	} catch (err) {
		console.error('[db] Error reopening liveDb:', err);
		throw err;
	}
}

// Seed demo data on startup; seedDemoData skips automatically when data already exists.
// Pass DEMO_DATABASE_FILE_PATH so the seed writes to the same file the app reads from.
seedDemoData({ dbPath: DEMO_DATABASE_FILE_PATH }).catch((err) => {
	console.error('[demo] Failed to seed demo data:', err);
});

export function getActiveDb() {
	return readDemoModeState() ? demoDb : liveDb;
}

console.log('✅ Database connected successfully (SQLite)');
