// migrations/migrate_data.js — OCF SQLite → PostgreSQL Data Migration
// Safety: One transaction, full rollback on any error, idempotency pre-check,
//         sequence reset, post-migration validation before COMMIT.
// Does NOT modify ocf.db, frontend, routes, auth, or database/db.js.
// Never exposes secrets, hashes, or DATABASE_URL.

'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const initSqlJs = require('sql.js');
const fs = require('fs');
const { Client } = require('pg');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBool(v) {
  if (v === null || v === undefined) return null;
  return v === 1 || v === true;
}

function parseDecimal(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseJsonb(str, fallback = []) {
  if (str === null || str === undefined) return JSON.stringify(fallback);
  try { return JSON.stringify(JSON.parse(str)); } catch { return JSON.stringify(fallback); }
}

// SQLite stores datetime as "YYYY-MM-DD HH:MM:SS" in UTC
function parseDatetime(str) {
  if (!str) return null;
  // Append UTC marker so JS Date parses it as UTC
  return new Date(str.trim().replace(' ', 'T') + 'Z').toISOString();
}

function maskHash(hash) {
  if (!hash) return '[null]';
  return hash.slice(0, 7) + '...[REDACTED]';
}

function buildSecurePgConfig(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('DATABASE_URL is required and must be a PostgreSQL connection string.');
  }

  const url = new URL(connectionString.trim());
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use a PostgreSQL protocol.');
  }

  const existingSslMode = url.searchParams.get('sslmode');
  if (existingSslMode && existingSslMode.toLowerCase() !== 'verify-full') {
    url.searchParams.set('sslmode', 'verify-full');
  } else if (!existingSslMode) {
    url.searchParams.set('sslmode', 'verify-full');
  }

  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load SQLite
  const DB_PATH = path.join(__dirname, '..', 'database', 'ocf.db');
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ ocf.db not found at', DB_PATH);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const sqdb = new SQL.Database(fs.readFileSync(DB_PATH));

  function sq(sql, params = []) {
    const stmt = sqdb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  // 2. Read all SQLite data (read-only snapshot)
  console.log('\n📖 Reading SQLite data snapshot...');
  const sqlite = {
    categories:  sq('SELECT * FROM categories ORDER BY id'),
    users:       sq('SELECT * FROM users ORDER BY id'),
    products:    sq('SELECT * FROM products ORDER BY id'),
    bundles:     sq('SELECT * FROM bundles ORDER BY id'),
    promos:      sq('SELECT * FROM promo_codes ORDER BY id'),
    orders:      sq('SELECT * FROM orders ORDER BY id'),
    orderItems:  sq('SELECT * FROM order_items ORDER BY id'),
    reviews:     sq('SELECT * FROM reviews ORDER BY id'),
    wishlists:   sq('SELECT * FROM wishlists ORDER BY id'),
    carts:       sq('SELECT * FROM carts ORDER BY id'),
    contacts:    sq('SELECT * FROM contacts ORDER BY id'),
    newsletter:  sq('SELECT * FROM newsletter ORDER BY id'),
  };

  const expectedCounts = {
    categories: 5, users: 1, products: 8, bundles: 5,
    promo_codes: 5, orders: 0, order_items: 0, reviews: 6,
    wishlists: 0, carts: 0, contacts: 0, newsletter: 0,
  };

  console.log('📊 SQLite row counts:');
  console.log(`   categories:  ${sqlite.categories.length}`);
  console.log(`   users:       ${sqlite.users.length}`);
  console.log(`   products:    ${sqlite.products.length}`);
  console.log(`   bundles:     ${sqlite.bundles.length}`);
  console.log(`   promo_codes: ${sqlite.promos.length}`);
  console.log(`   orders:      ${sqlite.orders.length}`);
  console.log(`   order_items: ${sqlite.orderItems.length}`);
  console.log(`   reviews:     ${sqlite.reviews.length}`);

  // Validate against audit expectations
  if (sqlite.categories.length !== 5) throw new Error(`Unexpected categories count: ${sqlite.categories.length}`);
  if (sqlite.users.length !== 1) throw new Error(`Unexpected users count: ${sqlite.users.length}`);
  if (sqlite.products.length !== 8) throw new Error(`Unexpected products count: ${sqlite.products.length}`);
  if (sqlite.bundles.length !== 5) throw new Error(`Unexpected bundles count: ${sqlite.bundles.length}`);
  if (sqlite.promos.length !== 5) throw new Error(`Unexpected promo_codes count: ${sqlite.promos.length}`);
  if (sqlite.reviews.length !== 6) throw new Error(`Unexpected reviews count: ${sqlite.reviews.length}`);

  sqdb.close();
  console.log('✅ SQLite snapshot validated.\n');

  // 3. Connect to PostgreSQL
  const client = new Client(buildSecurePgConfig(process.env.DATABASE_URL));
  await client.connect();
  console.log('🔗 Connected to Supabase PostgreSQL.\n');

  // 4. Idempotency pre-check: verify target tables are empty
  console.log('🔍 Pre-migration idempotency check (verifying target tables are empty)...');
  const tablesWithData = [];
  const tablesToCheck = [
    'categories', 'users', 'products', 'bundles', 'promo_codes', 'reviews'
  ];
  for (const tbl of tablesToCheck) {
    const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
    const cnt = parseInt(rows[0].cnt, 10);
    if (cnt > 0) {
      tablesWithData.push({ table: tbl, count: cnt });
    }
  }

  if (tablesWithData.length > 0) {
    console.error('🛑 STOP: Target PostgreSQL tables already contain rows. Aborting to prevent overwrite.');
    console.error('   Tables with existing rows:', JSON.stringify(tablesWithData, null, 2));
    await client.end();
    process.exit(1);
  }
  console.log('✅ All target tables confirmed empty. Safe to proceed.\n');

  // 5. BEGIN TRANSACTION
  console.log('🔄 Starting migration transaction...\n');
  await client.query('BEGIN');

  try {
    // ── Step 1: CATEGORIES ────────────────────────────────────────────────────
    console.log('📦 Migrating categories (5 rows)...');
    for (const c of sqlite.categories) {
      await client.query(
        `INSERT INTO categories (id, name, slug, description, image, region, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          c.id,
          c.name,
          c.slug,
          c.description || null,
          c.image || null,
          c.region || null,
          parseBool(c.is_active),
          parseDatetime(c.created_at)
        ]
      );
    }
    console.log('   ✅ categories inserted.\n');

    // ── Step 2: USERS ─────────────────────────────────────────────────────────
    console.log('👤 Migrating users (1 row)...');
    for (const u of sqlite.users) {
      await client.query(
        `INSERT INTO users (id, name, email, password, role, phone, address, city, country, avatar, is_verified, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          u.id,
          u.name,
          u.email,
          u.password,  // bcrypt hash preserved exactly; never logged
          u.role || 'customer',
          u.phone || null,
          u.address || null,
          u.city || null,
          u.country || 'Ethiopia',
          u.avatar || null,
          parseBool(u.is_verified),
          parseDatetime(u.created_at),
          parseDatetime(u.updated_at)
        ]
      );
      console.log(`   ✅ User ID ${u.id} inserted (hash preserved: ${maskHash(u.password)}).`);
    }
    console.log();

    // ── Step 3: PRODUCTS ──────────────────────────────────────────────────────
    console.log('👗 Migrating products (8 rows)...');
    for (const p of sqlite.products) {
      await client.query(
        `INSERT INTO products (
           id, name, slug, description, short_desc,
           price, compare_price, cost_price,
           images, sizes, colors,
           stock, sku, region,
           gender, age_group, age_range,
           material, care, category_id,
           is_best_seller, is_featured, is_new, is_active,
           rating, review_count,
           badge, badge_text,
           created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
           $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
         )`,
        [
          p.id,
          p.name,
          p.slug,
          p.description || null,
          p.short_desc || null,
          parseDecimal(p.price),
          parseDecimal(p.compare_price),
          parseDecimal(p.cost_price),
          parseJsonb(p.images, []),
          parseJsonb(p.sizes, ['S','M','L','XL','XXL']),
          parseJsonb(p.colors, []),
          p.stock || 0,
          p.sku || null,
          p.region || null,
          'unisex',        // PG-only new field default
          'adult',         // PG-only new field default
          JSON.stringify([]),  // PG-only new field default
          p.material || null,
          p.care || null,
          p.category_id || null,
          parseBool(p.is_best_seller),
          parseBool(p.is_featured),
          parseBool(p.is_new),
          parseBool(p.is_active),
          parseDecimal(p.rating),
          p.review_count || 0,
          p.badge || null,
          p.badge_text || null,
          parseDatetime(p.created_at),
          parseDatetime(p.updated_at)
        ]
      );
    }
    console.log('   ✅ products inserted.\n');

    // ── Step 4: BUNDLES ───────────────────────────────────────────────────────
    console.log('🎁 Migrating bundles (5 rows)...');
    for (const b of sqlite.bundles) {
      await client.query(
        `INSERT INTO bundles (id, name, slug, description, icon, price, compare_price, discount_pct, savings, items_json, is_featured, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          b.id,
          b.name,
          b.slug,
          b.description || null,
          b.icon || null,
          parseDecimal(b.price),
          parseDecimal(b.compare_price),
          parseDecimal(b.discount_pct),
          parseDecimal(b.savings),
          parseJsonb(b.items_json, []),
          parseBool(b.is_featured),
          parseBool(b.is_active),
          parseDatetime(b.created_at)
        ]
      );
    }
    console.log('   ✅ bundles inserted.\n');

    // ── Step 5: PROMO CODES ───────────────────────────────────────────────────
    console.log('🏷️ Migrating promo_codes (5 rows)...');
    for (const pc of sqlite.promos) {
      await client.query(
        `INSERT INTO promo_codes (id, code, type, value, min_order, max_uses, uses, expires_at, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          pc.id,
          pc.code,
          pc.type || 'percent',
          parseDecimal(pc.value),
          parseDecimal(pc.min_order) || 0,
          pc.max_uses || 100,
          pc.uses || 0,
          pc.expires_at ? parseDatetime(pc.expires_at) : null,
          parseBool(pc.is_active),
          parseDatetime(pc.created_at)
        ]
      );
    }
    console.log('   ✅ promo_codes inserted.\n');

    // ── Steps 6-7: ORDERS / ORDER_ITEMS ──────────────────────────────────────
    console.log('📋 orders:      0 rows — skipping (empty).');
    console.log('📋 order_items: 0 rows — skipping (empty).\n');

    // ── Step 8: REVIEWS ───────────────────────────────────────────────────────
    console.log('⭐ Migrating reviews (6 rows)...');
    for (const r of sqlite.reviews) {
      await client.query(
        `INSERT INTO reviews (id, product_id, user_id, guest_name, guest_email, rating, title, comment, images, is_verified, is_approved, location, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          r.id,
          r.product_id,
          r.user_id || null,
          r.guest_name || null,
          r.guest_email || null,
          r.rating,
          r.title || null,
          r.comment || null,
          parseJsonb(r.images, []),
          parseBool(r.is_verified),
          parseBool(r.is_approved),
          r.location || null,
          parseDatetime(r.created_at)
        ]
      );
    }
    console.log('   ✅ reviews inserted.\n');

    // ── Steps 9-12: Empty tables ──────────────────────────────────────────────
    console.log('📋 wishlists:  0 rows — skipping (empty).');
    console.log('📋 carts:      0 rows — skipping (empty).');
    console.log('📋 contacts:   0 rows — skipping (empty).');
    console.log('📋 newsletter: 0 rows — skipping (empty).\n');

    // ── Sequence Resets ───────────────────────────────────────────────────────
    console.log('🔄 Resetting PostgreSQL sequences...');
    const seqTables = [
      { table: 'categories',  seq: 'categories_id_seq' },
      { table: 'users',       seq: 'users_id_seq' },
      { table: 'products',    seq: 'products_id_seq' },
      { table: 'bundles',     seq: 'bundles_id_seq' },
      { table: 'promo_codes', seq: 'promo_codes_id_seq' },
      { table: 'reviews',     seq: 'reviews_id_seq' },
    ];

    const seqResults = {};
    for (const { table, seq } of seqTables) {
      const { rows } = await client.query(
        `SELECT setval('${seq}', GREATEST((SELECT MAX(id) FROM ${table}), 1)) AS new_val`
      );
      seqResults[table] = rows[0].new_val;
      console.log(`   ✅ ${seq} reset to ${rows[0].new_val}`);
    }
    console.log();

    // ── Pre-COMMIT Validation ─────────────────────────────────────────────────
    console.log('🔍 Running pre-COMMIT validation...\n');
    const errors = [];

    // 1. Row counts
    const countChecks = [
      { table: 'categories',  expected: 5 },
      { table: 'users',       expected: 1 },
      { table: 'products',    expected: 8 },
      { table: 'bundles',     expected: 5 },
      { table: 'promo_codes', expected: 5 },
      { table: 'orders',      expected: 0 },
      { table: 'order_items', expected: 0 },
      { table: 'reviews',     expected: 6 },
      { table: 'wishlists',   expected: 0 },
      { table: 'carts',       expected: 0 },
      { table: 'contacts',    expected: 0 },
      { table: 'newsletter',  expected: 0 },
    ];
    const countResults = {};
    for (const { table, expected } of countChecks) {
      const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
      const actual = parseInt(rows[0].cnt, 10);
      countResults[table] = { expected, actual, ok: actual === expected };
      if (actual !== expected) errors.push(`❌ Row count mismatch: ${table} expected ${expected}, got ${actual}`);
      else console.log(`   ✅ ${table}: ${actual} rows (expected ${expected})`);
    }

    // 2. ID preservation: verify min/max IDs match SQLite
    const idChecks = [
      { table: 'categories', minId: 1, maxId: 5 },
      { table: 'users',      minId: 1, maxId: 1 },
      { table: 'products',   minId: 1, maxId: 8 },
      { table: 'bundles',    minId: 1, maxId: 5 },
      { table: 'promo_codes',minId: 1, maxId: 5 },
      { table: 'reviews',    minId: 1, maxId: 6 },
    ];
    console.log();
    for (const { table, minId, maxId } of idChecks) {
      const { rows } = await client.query(`SELECT MIN(id) AS mn, MAX(id) AS mx FROM ${table}`);
      const mn = parseInt(rows[0].mn, 10);
      const mx = parseInt(rows[0].mx, 10);
      if (mn !== minId || mx !== maxId) {
        errors.push(`❌ ID mismatch in ${table}: expected [${minId}..${maxId}], got [${mn}..${mx}]`);
      } else {
        console.log(`   ✅ ${table} IDs preserved: [${mn}..${mx}]`);
      }
    }

    // 3. Foreign key: all product.category_id reference valid categories
    console.log();
    const { rows: fkProd } = await client.query(
      `SELECT COUNT(*) AS cnt FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.category_id IS NOT NULL AND c.id IS NULL`
    );
    if (parseInt(fkProd[0].cnt) > 0) errors.push(`❌ Orphaned product.category_id found: ${fkProd[0].cnt} rows`);
    else console.log('   ✅ All product.category_id FK references valid');

    // 4. Foreign key: all review.product_id reference valid products
    const { rows: fkRev } = await client.query(
      `SELECT COUNT(*) AS cnt FROM reviews r
       LEFT JOIN products p ON r.product_id = p.id
       WHERE r.product_id IS NOT NULL AND p.id IS NULL`
    );
    if (parseInt(fkRev[0].cnt) > 0) errors.push(`❌ Orphaned review.product_id found: ${fkRev[0].cnt} rows`);
    else console.log('   ✅ All review.product_id FK references valid');

    // 5. Unique constraints: check duplicates in unique columns
    const { rows: dupSlugs } = await client.query(`SELECT slug, COUNT(*) FROM products GROUP BY slug HAVING COUNT(*) > 1`);
    if (dupSlugs.length > 0) errors.push(`❌ Duplicate product slugs: ${dupSlugs.length}`);
    else console.log('   ✅ No duplicate product slugs');

    const { rows: dupEmails } = await client.query(`SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1`);
    if (dupEmails.length > 0) errors.push(`❌ Duplicate user emails: ${dupEmails.length}`);
    else console.log('   ✅ No duplicate user emails');

    const { rows: dupCodes } = await client.query(`SELECT code, COUNT(*) FROM promo_codes GROUP BY code HAVING COUNT(*) > 1`);
    if (dupCodes.length > 0) errors.push(`❌ Duplicate promo codes: ${dupCodes.length}`);
    else console.log('   ✅ No duplicate promo codes');

    // 6. JSONB validity: check images field in products (at least valid JSONB array)
    const { rows: jsonbCheck } = await client.query(
      `SELECT COUNT(*) AS cnt FROM products WHERE jsonb_typeof(images) != 'array'`
    );
    if (parseInt(jsonbCheck[0].cnt) > 0) errors.push(`❌ products.images JSONB not array: ${jsonbCheck[0].cnt} rows`);
    else console.log('   ✅ All products.images are valid JSONB arrays');

    // 7. Admin user email exists exactly once
    const { rows: adminCheck } = await client.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`
    );
    if (parseInt(adminCheck[0].cnt) !== 1) errors.push(`❌ Admin user count unexpected: ${adminCheck[0].cnt}`);
    else console.log('   ✅ Admin user exists exactly once');

    // 8. bcrypt hash format check (starts with $2a$ or $2b$) — without printing it
    const { rows: hashCheck } = await client.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE password NOT LIKE '$2%'`
    );
    if (parseInt(hashCheck[0].cnt) > 0) errors.push(`❌ ${hashCheck[0].cnt} user(s) have non-bcrypt password hash`);
    else console.log('   ✅ bcrypt password hash format verified (not exposed)');

    // 9. Sequence safety: next val for each table must be > max imported ID
    console.log();
    for (const { table, seq } of seqTables) {
      const { rows: nv } = await client.query(`SELECT nextval('${seq}') AS nv`);
      const next = parseInt(nv[0].nv, 10);
      // Restore after peek
      await client.query(`SELECT setval('${seq}', ${next - 1})`);
      const { rows: mx } = await client.query(`SELECT MAX(id) AS mx FROM ${table}`);
      const maxId = parseInt(mx[0].mx || 0, 10);
      if (next <= maxId) errors.push(`❌ Sequence ${seq} next (${next}) would collide with max ID (${maxId})`);
      else console.log(`   ✅ ${seq} next=${next} safe (max imported id=${maxId})`);
    }

    // Evaluate all validation results
    console.log();
    if (errors.length > 0) {
      console.error('🛑 Validation FAILED — rolling back transaction:');
      errors.forEach(e => console.error('   ' + e));
      await client.query('ROLLBACK');
      await client.end();
      process.exit(1);
    }

    // All validation passed — COMMIT
    console.log('✅ All pre-COMMIT validations passed.');
    await client.query('COMMIT');
    console.log('\n🎉 COMMIT successful. Migration complete.\n');

  } catch (err) {
    console.error('❌ Migration error — rolling back:', err.message);
    await client.query('ROLLBACK');
    await client.end();
    process.exit(1);
  }

  // ── Post-COMMIT Read-Only Verification ────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('🔍 POST-COMMIT read-only verification...\n');

  const finalCounts = {};
  const tables = ['categories','users','products','bundles','promo_codes',
                  'orders','order_items','reviews','wishlists','carts',
                  'contacts','newsletter'];
  for (const t of tables) {
    const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM ${t}`);
    finalCounts[t] = parseInt(rows[0].cnt, 10);
    console.log(`   ${t}: ${finalCounts[t]} rows`);
  }

  // Sample verification: category names
  const { rows: cats } = await client.query(`SELECT id, name, slug, is_active FROM categories ORDER BY id`);
  console.log('\n   Categories imported:');
  cats.forEach(c => console.log(`     [${c.id}] ${c.name} (${c.slug}) active=${c.is_active}`));

  // Sample verification: product names (no prices logged as they're non-secret but to keep output clean)
  const { rows: prods } = await client.query(`SELECT id, name, slug, category_id, is_active FROM products ORDER BY id`);
  console.log('\n   Products imported:');
  prods.forEach(p => console.log(`     [${p.id}] ${p.name} (cat=${p.category_id}) active=${p.is_active}`));

  // Bundles
  const { rows: buns } = await client.query(`SELECT id, name, slug FROM bundles ORDER BY id`);
  console.log('\n   Bundles imported:');
  buns.forEach(b => console.log(`     [${b.id}] ${b.name}`));

  // Promo codes
  const { rows: promos } = await client.query(`SELECT id, code, type FROM promo_codes ORDER BY id`);
  console.log('\n   Promo codes imported:');
  promos.forEach(pc => console.log(`     [${pc.id}] ${pc.code} (${pc.type})`));

  // Reviews
  const { rows: revs } = await client.query(`SELECT id, product_id, guest_name, rating, is_approved FROM reviews ORDER BY id`);
  console.log('\n   Reviews imported:');
  revs.forEach(r => console.log(`     [${r.id}] product=${r.product_id} by "${r.guest_name}" rating=${r.rating} approved=${r.is_approved}`));

  // Admin user (safe fields only, no password)
  const { rows: admins } = await client.query(`SELECT id, name, email, role, is_verified FROM users`);
  console.log('\n   Users imported:');
  admins.forEach(u => console.log(`     [${u.id}] ${u.name} <${u.email}> role=${u.role} verified=${u.is_verified}`));

  console.log('\n✅ Post-commit verification complete.');
  console.log('─'.repeat(60));

  await client.end();
  console.log('\n🏁 Migration finished successfully. No further action taken.');
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
