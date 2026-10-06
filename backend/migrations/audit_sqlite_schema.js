// audit_sqlite_schema_only.js — Tables + schema info only
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');

async function run() {
  const DB_PATH = path.join(__dirname, '..', 'database', 'ocf.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  function q(sql) { const s = db.prepare(sql); const r = []; while(s.step()) r.push(s.getAsObject()); s.free(); return r; }

  const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const result = { row_counts: {}, schemas: {}, foreign_keys: {} };

  for (const { name } of tables) {
    result.row_counts[name] = q(`SELECT COUNT(*) as cnt FROM "${name}"`)[0].cnt;
    result.schemas[name] = q(`PRAGMA table_info(${name})`);
    result.foreign_keys[name] = q(`PRAGMA foreign_key_list(${name})`);
  }

  // Also get the single user (role only, no password)
  result.users_roles = q('SELECT id, name, email, role, phone, country, is_verified, created_at FROM users');

  console.log(JSON.stringify(result, null, 2));
  db.close();
}
run();
