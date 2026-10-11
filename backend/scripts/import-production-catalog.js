'use strict';

const { Client } = require('pg');
const catalog = require('../migrations/catalog_data.json');

const categories = [
  { name: "Women's Wear", slug: 'womens-wear' },
  { name: "Men's Wear", slug: 'mens-wear' },
  { name: "Children's Wear", slug: 'childrens-wear' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Wedding Collection', slug: 'wedding-collection' }
];

function resolveMode(env) {
  const mode = env.OCF_CATALOG_IMPORT_MODE || 'dry-run';
  if (!['dry-run', 'apply'].includes(mode)) {
    throw new Error('OCF_CATALOG_IMPORT_MODE must be dry-run or apply.');
  }
  if (mode === 'apply' && env.OCF_CATALOG_IMPORT_APPROVED !== 'YES') {
    throw new Error('Set OCF_CATALOG_IMPORT_APPROVED=YES to explicitly approve catalog inserts.');
  }
  return mode;
}

function buildConnectionConfig(env) {
  const connectionString = env.OCF_CATALOG_IMPORT_DATABASE_URL;
  if (typeof connectionString !== 'string' || !connectionString || connectionString !== connectionString.trim()) {
    throw new Error('OCF_CATALOG_IMPORT_DATABASE_URL is required and must not contain surrounding whitespace.');
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('OCF_CATALOG_IMPORT_DATABASE_URL must be a valid PostgreSQL URL; its value will not be displayed.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) {
    throw new Error('OCF_CATALOG_IMPORT_DATABASE_URL must be a PostgreSQL URL without a fragment.');
  }
  if (['host', 'hostaddr', 'service', 'database', 'dbname', 'port'].some(key => url.searchParams.has(key))) {
    throw new Error('OCF_CATALOG_IMPORT_DATABASE_URL must not override its host, port, or database through query parameters.');
  }

  const allowedHost = env.OCF_CATALOG_IMPORT_ALLOWED_DATABASE_HOST;
  const validHost = typeof allowedHost === 'string' &&
    allowedHost === allowedHost.toLowerCase() &&
    allowedHost.split('.').length >= 2 &&
    allowedHost.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (!validHost) {
    throw new Error('OCF_CATALOG_IMPORT_ALLOWED_DATABASE_HOST must be the exact lowercase database hostname.');
  }
  if (url.hostname !== allowedHost) {
    throw new Error('The database URL hostname does not match the independently configured target allowlist.');
  }

  const allowedDatabaseName = env.OCF_CATALOG_IMPORT_ALLOWED_DATABASE_NAME;
  if (typeof allowedDatabaseName !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(allowedDatabaseName)) {
    throw new Error('OCF_CATALOG_IMPORT_ALLOWED_DATABASE_NAME must be the exact database name.');
  }

  const databasePath = url.pathname;
  if (!databasePath.startsWith('/') ||
      databasePath.length < 2 ||
      databasePath.slice(1).includes('/') ||
      databasePath.includes('\\') ||
      /%(?:2f|5c)/i.test(databasePath)) {
    throw new Error('The database URL must contain exactly one database path segment.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(databasePath.slice(1));
  } catch {
    throw new Error('The database URL contains a malformed database name.');
  }
  if (databaseName !== allowedDatabaseName) {
    throw new Error('The database URL name does not match the independently configured target allowlist.');
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  };
}

function categorySlugFor(product) {
  const name = product.name.toLowerCase();
  if (product.cat === 'wedding') return 'wedding-collection';
  if (name.includes('shawl')) return 'accessories';
  if (product.gender === 'women') return 'womens-wear';
  if (product.gender === 'men') return 'mens-wear';
  if (product.gender === 'kids') return 'childrens-wear';
  throw new Error(`Unsupported catalog category for product ${product.id}.`);
}

function slugFor(name, id) {
  return `${name.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-${id}`;
}

function skuFor(gender, id) {
  const prefix = gender === 'men' ? 'OCF-M' : gender === 'women' ? 'OCF-W' : 'OCF-K';
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

function validateCatalog(products = catalog.PRODUCTS) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('The tracked catalog source contains no products.');
  }

  const ids = new Set();
  for (const product of products) {
    if (!Number.isSafeInteger(product.id) || product.id < 1 || ids.has(product.id) ||
        typeof product.name !== 'string' || !product.name.trim() ||
        !Number.isFinite(Number(product.price)) || Number(product.price) < 0 ||
        !Number.isSafeInteger(Number(product.stock || 0)) || Number(product.stock || 0) < 0 ||
        !['men', 'women', 'kids'].includes(product.gender) ||
        !Array.isArray(product.images || []) ||
        !Array.isArray(product.sizes || []) ||
        !Array.isArray(product.colors || [])) {
      throw new Error('The tracked catalog source contains an invalid or duplicate product.');
    }
    ids.add(product.id);
    categorySlugFor(product);
  }
}

async function insertCatalog(client) {
  const categoryIds = new Map();
  for (const category of categories) {
    const result = await client.query(
      `INSERT INTO categories (name, name_en, slug, is_active)
       VALUES ($1, $1, $2, TRUE)
       RETURNING id`,
      [category.name, category.slug]
    );
    categoryIds.set(category.slug, result.rows[0].id);
  }

  for (const product of catalog.PRODUCTS) {
    const description = product.description || '';
    const badgeText = product.badge_text || null;
    await client.query(
      `INSERT INTO products (
        name, name_en, slug, description, description_en, short_desc,
        price, compare_price, cost_price, images, sizes, colors, stock, sku,
        region, gender, age_group, age_range, material, care, category_id,
        is_best_seller, is_featured, is_new, is_active, rating, review_count,
        badge, badge_text
      ) VALUES (
        $1, $1, $2, $3, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb,
        $10::jsonb, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19,
        $20, $21, $22, TRUE, $23, $24, $25, $26
      )`,
      [
        product.name.trim(),
        slugFor(product.name, product.id),
        description,
        description.slice(0, 140),
        Number(product.price),
        product.compare_price == null ? null : Number(product.compare_price),
        Math.round(Number(product.price) * 0.5),
        JSON.stringify(product.images || []),
        JSON.stringify(product.sizes || []),
        JSON.stringify(product.colors || []),
        Number(product.stock || 0),
        skuFor(product.gender, product.id),
        product.region || 'All',
        product.gender,
        product.ageGroup || 'adult',
        JSON.stringify(product.ageRange || []),
        product.material || null,
        product.care || null,
        categoryIds.get(categorySlugFor(product)),
        product.badge === 'bestseller' || /best seller/i.test(badgeText || ''),
        product.badge === 'featured' || /featured/i.test(badgeText || ''),
        product.badge === 'new' || /new/i.test(badgeText || ''),
        Number(product.rating ?? 5),
        Number(product.review_count ?? 0),
        product.badge || null,
        badgeText
      ]
    );
  }
}

async function run(env = process.env, createClient = config => new Client(config)) {
  const mode = resolveMode(env);
  validateCatalog();
  const client = createClient(buildConnectionConfig(env));
  let transactionOpen = false;

  try {
    await client.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('LOCK TABLE categories, products IN SHARE ROW EXCLUSIVE MODE');

    const { rows: [counts] } = await client.query(`
      SELECT
        (SELECT COUNT(*)::text FROM categories) AS categories,
        (SELECT COUNT(*)::text FROM products) AS products
    `);
    if (counts.categories !== '0' || counts.products !== '0') {
      throw new Error('Refusing to import: target categories and products must both be empty.');
    }

    if (mode === 'dry-run') {
      await client.query('ROLLBACK');
      transactionOpen = false;
      console.log(`Dry run passed: target catalog is empty; ${categories.length} categories and ${catalog.PRODUCTS.length} products are ready. No rows were inserted.`);
      return;
    }

    await insertCatalog(client);
    const { rows: [inserted] } = await client.query(`
      SELECT
        (SELECT COUNT(*)::text FROM categories) AS categories,
        (SELECT COUNT(*)::text FROM products) AS products
    `);
    if (inserted.categories !== String(categories.length) ||
        inserted.products !== String(catalog.PRODUCTS.length)) {
      throw new Error('Catalog verification failed before commit.');
    }

    await client.query('COMMIT');
    transactionOpen = false;
    console.log(`Catalog import committed: ${inserted.categories} categories and ${inserted.products} products. No users, orders, reviews, or other records were changed.`);
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        console.error('Rollback could not be confirmed; inspect the target database before retrying.');
      }
    }
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? ` (code ${error.code})`
      : '';
    console.error(`Catalog import failed${code}; no success was reported.`);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {
      console.error('Could not close the database connection cleanly.');
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  run().catch(() => {
    console.error('Catalog import setup failed; configuration details were not displayed.');
    process.exitCode = 1;
  });
}

module.exports = { buildConnectionConfig, categorySlugFor, resolveMode, run, validateCatalog };
