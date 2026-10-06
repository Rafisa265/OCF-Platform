// migrations/migrate.js — OCF PostgreSQL Migration Runner
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log('🔗 Connected to PostgreSQL successfully.');

    // 1. Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Fetch applied migrations
    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    // 3. Discover SQL migration files
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      const version = file.split('_')[0];
      if (appliedVersions.has(version)) {
        console.log(`⏩ Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`⏳ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied migration: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to apply migration ${file}:`, err.message);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('✨ Database schema is up to date. No pending migrations.');
    } else {
      console.log(`🎉 Successfully applied ${appliedCount} migration(s).`);
    }

    await client.end();
  } catch (err) {
    console.error('❌ Migration runner terminated with error:', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

runMigrations();
