'use strict';

const catalog = require('../migrations/catalog_data.json');
const { StagingGuardError, createStagingClient } = require('./staging-db');

const categories = [
  { name: "Women's Wear", slug: 'womens-wear' },
  { name: "Men's Wear", slug: 'mens-wear' },
  { name: "Children's Wear", slug: 'childrens-wear' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Wedding Collection', slug: 'wedding-collection' }
];

const categorySlugFor = product => {
  const name = String(product.name || '').toLowerCase();
  if (product.cat === 'wedding') return 'wedding-collection';
  if (name.includes('shawl')) return 'accessories';
  if (product.gender === 'women') return 'womens-wear';
  if (product.gender === 'men') return 'mens-wear';
  if (product.gender === 'kids') return 'childrens-wear';
  throw new StagingGuardError(`Unsupported catalog gender/category for product ${product.id}.`);
};

const slugFor = (name, id) => `${String(name)
  .toLowerCase()
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')}-${id}`;

const skuFor = (gender, id) => {
  const prefix = gender === 'men' ? 'OCF-M' : gender === 'women' ? 'OCF-W' : 'OCF-K';
  return `${prefix}-${String(id).padStart(3, '0')}`;
};

async function seedCatalog() {
  if (!Array.isArray(catalog.PRODUCTS) || catalog.PRODUCTS.length === 0) {
    throw new StagingGuardError('The staging catalog source contains no products.');
  }

  const productIds = new Set();
  for (const product of catalog.PRODUCTS) {
    if (!Number.isSafeInteger(product.id) || product.id < 1 || productIds.has(product.id) ||
        typeof product.name !== 'string' || !product.name.trim() ||
        !Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
      throw new StagingGuardError('The staging catalog source contains an invalid or duplicate product.');
    }
    productIds.add(product.id);
    categorySlugFor(product);
  }

  const client = createStagingClient();
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(`LOCK TABLE
      categories, products, bundles, users, orders, order_items, reviews,
      wishlists, carts, contacts, newsletter, promo_codes, checkout_idempotency
      IN SHARE ROW EXCLUSIVE MODE`);

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::text FROM categories) AS categories,
        (SELECT COUNT(*)::text FROM products) AS products,
        (SELECT COUNT(*)::text FROM bundles) AS bundles,
        (SELECT COUNT(*)::text FROM users) AS users,
        (SELECT COUNT(*)::text FROM orders) AS orders,
        (SELECT COUNT(*)::text FROM order_items) AS order_items,
        (SELECT COUNT(*)::text FROM reviews) AS reviews,
        (SELECT COUNT(*)::text FROM wishlists) AS wishlists,
        (SELECT COUNT(*)::text FROM carts) AS carts,
        (SELECT COUNT(*)::text FROM contacts) AS contacts,
        (SELECT COUNT(*)::text FROM newsletter) AS newsletter,
        (SELECT COUNT(*)::text FROM promo_codes) AS promo_codes,
        (SELECT COUNT(*)::text FROM checkout_idempotency) AS checkout_idempotency
    `);
    if (Object.values(counts.rows[0]).some(count => count !== '0')) {
      throw new StagingGuardError('Refusing to seed: staging schema must have empty catalog and application tables.');
    }

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
          id, name, name_en, slug, description, description_en, short_desc,
          price, compare_price, cost_price, images, sizes, colors, stock, sku,
          region, gender, age_group, age_range, material, care, category_id,
          is_best_seller, is_featured, is_new, is_active, rating, review_count,
          badge, badge_text
        ) VALUES (
          $1, $2, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
          $11::jsonb, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20,
          $21, $22, $23, TRUE, $24, $25, $26, $27
        )`,
        [
          product.id,
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
          product.gender || 'unisex',
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

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('products', 'id'),
        COALESCE(MAX(id), 1),
        COUNT(*) > 0
      ) FROM products
    `);
    await client.query('COMMIT');
    transactionOpen = false;
    console.log(`Inserted ${categories.length} staging categories and ${catalog.PRODUCTS.length} products. No reviews or customer records were copied.`);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof StagingGuardError) {
      console.error(error.message);
    } else {
      console.error('Staging catalog seed failed; database error details were not logged.');
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {
      console.error('Could not close the staging database connection cleanly.');
      process.exitCode = 1;
    });
  }
}

seedCatalog().catch(error => {
  console.error(error instanceof StagingGuardError ? error.message : 'Staging catalog seed failed; details were not logged.');
  process.exitCode = 1;
});
