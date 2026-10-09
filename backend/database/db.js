// database/db.js — PostgreSQL database connection & query helpers
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

// Ensure params are compatible with PostgreSQL
function prepareParams(params = []) {
  return params.map(val => {
    if (val === undefined) return null;
    return val;
  });
}

async function getDB() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW() as now');
    console.log('✅ PostgreSQL connected successfully at', res.rows[0].now);
    return pool;
  } finally {
    client.release();
  }
}

async function query(sql, params = []) {
  const cleanParams = prepareParams(params);
  const res = await pool.query(sql, cleanParams);
  return res.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const cleanParams = prepareParams(params);
  const res = await pool.query(sql, cleanParams);
  const lastInsertRowid = res.rows?.[0]?.id || null;
  return {
    rowCount: res.rowCount,
    lastInsertRowid,
    rows: res.rows
  };
}

module.exports = {
  pool,
  getDB,
  query,
  queryOne,
  run
};
