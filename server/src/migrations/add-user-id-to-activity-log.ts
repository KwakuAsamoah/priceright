import Database from 'better-sqlite3';

export function migrateActivityLog(
  db: Database.Database
) {
  try {
    // Check if columns already exist
    const cols = db.prepare(
      'PRAGMA table_info(activity_log)'
    ).all() as any[];

    const hasUserId = cols.some(
      c => c.name === 'user_id'
    );
    const hasUserName = cols.some(
      c => c.name === 'user_name'
    );

    if (!hasUserId) {
      db.prepare(
        'ALTER TABLE activity_log ' +
        'ADD COLUMN user_id INTEGER ' +
        'NOT NULL DEFAULT 1'
      ).run();
      console.log(
        '[migration] Added user_id to activity_log'
      );
    }

    if (!hasUserName) {
      db.prepare(
        'ALTER TABLE activity_log ' +
        'ADD COLUMN user_name TEXT ' +
        'NOT NULL DEFAULT "Admin"'
      ).run();
      console.log(
        '[migration] Added user_name to activity_log'
      );
    }
  } catch (err) {
    console.error(
      '[migration] activity_log migration failed:',
      err
    );
  }
}
