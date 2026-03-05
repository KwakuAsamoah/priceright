import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('./priceright.db');

sqlite.pragma('foreign_keys = ON');

function ensureSchemaTables() {
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
}

ensureSchemaTables();

export const db = drizzle(sqlite, { schema });

console.log('✅ Database connected successfully (SQLite)');