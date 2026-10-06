// migrations/verify_schema.js — Read-only verification of PostgreSQL schema
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function verify() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // 1. Tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);

    // 2. Migrations tracked
    const migRes = await client.query(`
      SELECT id, version, name, applied_at 
      FROM schema_migrations 
      ORDER BY id;
    `);

    // 3. Indexes
    const idxRes = await client.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    // 4. Foreign Keys
    const fkRes = await client.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name, 
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu 
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema 
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name 
        AND ccu.table_schema = tc.table_schema 
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public' 
      ORDER BY tc.table_name, kcu.column_name;
    `);

    // 5. Unique & Check Constraints
    const constrRes = await client.query(`
      SELECT table_name, constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_schema = 'public' AND constraint_type IN ('UNIQUE', 'CHECK')
      ORDER BY table_name, constraint_name;
    `);

    console.log(JSON.stringify({
      tables,
      migrations: migRes.rows,
      indexes: idxRes.rows.map(r => ({ table: r.tablename, index: r.indexname })),
      foreignKeys: fkRes.rows,
      constraintsCount: constrRes.rows.length
    }, null, 2));

    await client.end();
  } catch (err) {
    console.error('Verification failed:', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

verify();
