// audit_sqlite.js — Read-only SQLite audit for Phase 2 data migration planning
// Does NOT modify any data.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function auditSQLite() {
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const DB_PATH = path.join(__dirname, '..', 'database', 'ocf.db');

  if (!fs.existsSync(DB_PATH)) {
    console.error('ERROR: ocf.db not found at', DB_PATH);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  function query(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  const tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");

  const result = { tables: {} };

  for (const { name } of tables) {
    const schema = query(`PRAGMA table_info(${name})`);
    const fks = query(`PRAGMA foreign_key_list(${name})`);
    const count = query(`SELECT COUNT(*) as cnt FROM "${name}"`)[0].cnt;

    result.tables[name] = { schema, fks, count };
  }

  // Sample data per table
  result.samples = {};

  // Categories
  result.samples.categories = query('SELECT * FROM categories ORDER BY id');

  // Users (NO passwords)
  result.samples.users = query('SELECT id, name, email, role, country, is_verified, created_at FROM users ORDER BY id');

  // Products (key fields only)
  result.samples.products = query('SELECT id, name, slug, price, compare_price, stock, region, sku, category_id, sizes, images, colors, is_featured, is_best_seller, is_new, is_active, badge, badge_text, rating, review_count FROM products ORDER BY id');

  // Bundles
  result.samples.bundles = query('SELECT id, name, slug, price, compare_price, discount_pct, savings, items_json, is_featured, is_active FROM bundles ORDER BY id');

  // Orders
  result.samples.orders = query('SELECT id, order_number, user_id, guest_email, subtotal, shipping_cost, tax, discount, total, status, payment_method, payment_status, shipping_country, created_at FROM orders ORDER BY id');

  // Order items
  result.samples.order_items = query('SELECT id, order_id, product_id, bundle_id, name, price, quantity, size, total FROM order_items ORDER BY id');

  // Reviews
  result.samples.reviews = query('SELECT id, product_id, user_id, guest_name, guest_email, rating, title, is_verified, is_approved, location, created_at FROM reviews ORDER BY id');

  // Wishlists
  result.samples.wishlists = query('SELECT * FROM wishlists ORDER BY id');

  // Carts
  result.samples.carts = query('SELECT * FROM carts ORDER BY id');

  // Contacts
  result.samples.contacts = query('SELECT id, name, email, subject, is_read, replied, created_at FROM contacts ORDER BY id');

  // Newsletter
  result.samples.newsletter = query('SELECT id, email, name, discount_sent, created_at FROM newsletter ORDER BY id');

  // Promo codes
  result.samples.promo_codes = query('SELECT * FROM promo_codes ORDER BY id');

  // Data quality checks
  result.quality = {};

  // Duplicate emails in users
  result.quality.duplicate_user_emails = query('SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING cnt > 1');

  // Duplicate slugs in products
  result.quality.duplicate_product_slugs = query('SELECT slug, COUNT(*) as cnt FROM products GROUP BY slug HAVING cnt > 1');

  // Duplicate SKUs in products (non-null)
  result.quality.duplicate_skus = query("SELECT sku, COUNT(*) as cnt FROM products WHERE sku IS NOT NULL AND sku != '' GROUP BY sku HAVING cnt > 1");

  // Duplicate category slugs
  result.quality.duplicate_category_slugs = query('SELECT slug, COUNT(*) as cnt FROM categories GROUP BY slug HAVING cnt > 1');

  // Products with invalid/null prices
  result.quality.invalid_prices = query('SELECT id, name, price FROM products WHERE price IS NULL OR price < 0');

  // Products with invalid stock
  result.quality.invalid_stock = query('SELECT id, name, stock FROM products WHERE stock IS NULL OR stock < 0');

  // Products with null/orphaned category_id
  result.quality.orphaned_product_categories = query('SELECT p.id, p.name, p.category_id FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE c.id IS NULL AND p.category_id IS NOT NULL');

  // Order items with invalid order_id
  result.quality.orphaned_order_items = query('SELECT oi.id, oi.order_id FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL');

  // Reviews with invalid product_id
  result.quality.orphaned_reviews = query('SELECT r.id, r.product_id FROM reviews r LEFT JOIN products p ON r.product_id = p.id WHERE p.id IS NULL');

  // Invalid ratings
  result.quality.invalid_ratings = query('SELECT id, product_id, rating FROM reviews WHERE rating < 1 OR rating > 5');

  // Promo codes: uses > max_uses
  result.quality.overused_promos = query('SELECT id, code, uses, max_uses FROM promo_codes WHERE uses > max_uses');

  // Malformed JSON checks for products.images
  const allProducts = query('SELECT id, images, sizes, colors FROM products');
  result.quality.malformed_product_json = [];
  for (const p of allProducts) {
    const fields = ['images', 'sizes', 'colors'];
    for (const f of fields) {
      try { JSON.parse(p[f] || '[]'); }
      catch (e) { result.quality.malformed_product_json.push({ product_id: p.id, field: f, value: p[f] }); }
    }
  }

  // Malformed JSON checks for bundles.items_json
  const allBundles = query('SELECT id, items_json FROM bundles');
  result.quality.malformed_bundle_json = [];
  for (const b of allBundles) {
    try { JSON.parse(b.items_json || '[]'); }
    catch (e) { result.quality.malformed_bundle_json.push({ bundle_id: b.id, value: b.items_json }); }
  }

  // Duplicate newsletter emails
  result.quality.duplicate_newsletter_emails = query('SELECT email, COUNT(*) as cnt FROM newsletter GROUP BY email HAVING cnt > 1');

  // Duplicate promo codes
  result.quality.duplicate_promo_codes = query('SELECT code, COUNT(*) as cnt FROM promo_codes GROUP BY code HAVING cnt > 1');

  // Null check: order_items missing price or total
  result.quality.order_items_null_price = query('SELECT id, order_id FROM order_items WHERE price IS NULL OR total IS NULL');

  // Users with null passwords (would block auth migration)
  result.quality.users_null_password = query('SELECT id, email, role FROM users WHERE password IS NULL OR password = \'\'');

  db.close();

  // Output without any secret values
  console.log(JSON.stringify(result, null, 2));
}

auditSQLite().catch(err => { console.error('AUDIT ERROR:', err.message); process.exit(1); });
