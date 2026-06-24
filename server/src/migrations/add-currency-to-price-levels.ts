import Database from 'better-sqlite3';

export function migratePriceLevelCurrency(
  db: Database.Database,
) {
  try {
    const cols = db.prepare(
      'PRAGMA table_info(price_levels)',
    ).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'currency_id')) {
      db.prepare(
        'ALTER TABLE price_levels '
        + 'ADD COLUMN currency_id INTEGER '
        + 'REFERENCES currencies(id) '
        + 'ON DELETE SET NULL',
      ).run();
      console.log(
        '[migration] Added currency_id '
        + 'to price_levels',
      );
    }
  } catch (err) {
    console.error(
      '[migration] price_levels '
      + 'currency failed:', err,
    );
  }
}
