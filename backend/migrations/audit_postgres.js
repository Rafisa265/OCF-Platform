// audit_postgres.js — Read-only PostgreSQL schema audit for Phase 2 migration planning
// Does NOT modify any data.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function auditPostgres() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const result = {};

  // 1. All tables with row counts
  const tablesRes = await client.query(`
    SELECT 
      t.table_name,
      s.n_live_tup AS approx_row_count
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
    WHERE t.table_schema = 'public'
    ORDER BY t.table_name;
  `);
  result.tables = tablesRes.rows;

  // 2. Full column definitions per table
  const colsRes = await client.query(`
    SELECT 
      table_name,
      column_name,
      ordinal_position,
      column_default,
      is_nullable,
      data_type,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);
  result.columns = colsRes.rows;

  // 3. Primary keys
  const pkRes = await client.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  `);
  result.primary_keys = pkRes.rows;

  // 4. Foreign keys
  const fkRes = await client.query(`
    SELECT 
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      rc.delete_rule,
      rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  `);
  result.foreign_keys = fkRes.rows;

  // 5. Unique constraints
  const uqRes = await client.query(`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);
  result.unique_constraints = uqRes.rows;

  // 6. Check constraints
  const chkRes = await client.query(`
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.constraint_type = 'CHECK'
      AND tc.table_schema = 'public'
      AND cc.check_clause NOT LIKE '%IS NOT NULL%'
    ORDER BY tc.table_name, tc.constraint_name;
  `);
  result.check_constraints = chkRes.rows;

  // 7. Indexes
  const idxRes = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);
  result.indexes = idxRes.rows;

  console.log(JSON.stringify(result, null, 2));
  await client.end();
}

auditPostgres().catch(err => { console.error('PG AUDIT ERROR:', err.message); process.exit(1); });
