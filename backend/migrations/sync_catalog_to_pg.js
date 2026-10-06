// migrations/sync_catalog_to_pg.js — Sync 32 Products & Reviews from index.html to PostgreSQL
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const catalog = require('./catalog_data.json');

const { PRODUCTS, REVIEWS_DATA } = catalog;

function getCategoryId(gender, cat, name) {
  const n = (name || '').toLowerCase();
  if (cat === 'wedding') return 5; // Wedding Collection
  if (n.includes('shawl')) return 4; // Accessories
  if (gender === 'women') return 1; // Women's Wear
  if (gender === 'men') return 2;   // Men's Wear
  if (gender === 'kids') return 3;  // Children's Wear
  return 1;
}

function generateSlug(name, id) {
  const base = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${base}-${id}`;
}

function generateSku(gender, id) {
  const prefix = gender === 'men' ? 'OCF-M' : gender === 'women' ? 'OCF-W' : 'OCF-K';
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

async function sync() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Connecting to PostgreSQL...');
  await client.connect();

  try {
    await client.query('BEGIN');
    console.log('Transaction started.');

    // 1. Temporarily clear existing reviews and products to re-sync cleanly without SKU collisions
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM products');
    console.log('Cleared existing products & reviews for clean 32-item catalog sync.');

    // 2. Insert all 32 products
    console.log(`Syncing ${PRODUCTS.length} products...`);
    for (const p of PRODUCTS) {
      const categoryId = getCategoryId(p.gender, p.cat, p.name);
      const slug = generateSlug(p.name, p.id);
      const sku = generateSku(p.gender, p.id);
      const isBestSeller = p.badge === 'bestseller' || (p.badge_text || '').toLowerCase().includes('best seller');
      const isFeatured = p.badge === 'featured' || (p.badge_text || '').toLowerCase().includes('featured');
      const isNew = p.badge === 'new' || (p.badge_text || '').toLowerCase().includes('new');
      const costPrice = Math.round(p.price * 0.5);

      const sql = `
        INSERT INTO products (
          id, name, slug, description, short_desc, price, compare_price, cost_price,
          images, sizes, colors, stock, sku, region, gender, age_group, age_range,
          material, care, category_id, is_best_seller, is_featured, is_new, is_active,
          rating, review_count, badge, badge_text, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          description = EXCLUDED.description,
          short_desc = EXCLUDED.short_desc,
          price = EXCLUDED.price,
          compare_price = EXCLUDED.compare_price,
          cost_price = EXCLUDED.cost_price,
          images = EXCLUDED.images,
          sizes = EXCLUDED.sizes,
          colors = EXCLUDED.colors,
          stock = EXCLUDED.stock,
          sku = EXCLUDED.sku,
          region = EXCLUDED.region,
          gender = EXCLUDED.gender,
          age_group = EXCLUDED.age_group,
          age_range = EXCLUDED.age_range,
          material = EXCLUDED.material,
          care = EXCLUDED.care,
          category_id = EXCLUDED.category_id,
          is_best_seller = EXCLUDED.is_best_seller,
          is_featured = EXCLUDED.is_featured,
          is_new = EXCLUDED.is_new,
          is_active = EXCLUDED.is_active,
          rating = EXCLUDED.rating,
          review_count = EXCLUDED.review_count,
          badge = EXCLUDED.badge,
          badge_text = EXCLUDED.badge_text,
          updated_at = NOW();
      `;

      const params = [
        p.id,
        p.name,
        slug,
        p.description || '',
        p.description ? p.description.slice(0, 140) : '',
        p.price,
        p.compare_price || null,
        costPrice,
        JSON.stringify(p.images || []),
        JSON.stringify(p.sizes || []),
        JSON.stringify(p.colors || []),
        p.stock || 0,
        sku,
        p.region || 'All',
        p.gender || 'unisex',
        p.ageGroup || 'adult',
        JSON.stringify(p.ageRange || []),
        p.material || null,
        p.care || null,
        categoryId,
        isBestSeller,
        isFeatured,
        isNew,
        true,
        p.rating || 5.0,
        p.review_count || 0,
        p.badge || null,
        p.badge_text || null
      ];

      await client.query(sql, params);
    }
    console.log('✅ All 32 products successfully upserted.');

    // 3. Insert Reviews
    let totalReviews = 0;
    for (const [prodIdStr, reviews] of Object.entries(REVIEWS_DATA)) {
      const prodId = parseInt(prodIdStr, 10);
      for (const r of reviews) {
        const guestEmail = `${r.author.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
        const title = r.text.length > 50 ? r.text.slice(0, 47) + '...' : r.text;
        await client.query(`
          INSERT INTO reviews (product_id, guest_name, guest_email, rating, title, comment, location, is_verified, is_approved, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, NOW())
        `, [prodId, r.author, guestEmail, r.rating, title, r.text, 'Global / Verified Purchase']);
        totalReviews++;
      }
    }
    console.log(`✅ ${totalReviews} customer reviews imported.`);

    // 4. Reset sequences so future additions increment properly
    await client.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products), true)`);
    await client.query(`SELECT setval('reviews_id_seq', (SELECT MAX(id) FROM reviews), true)`);
    console.log('✅ PostgreSQL sequences reset.');

    await client.query('COMMIT');
    console.log('🎉 TRANSACTION COMMITTED SUCCESSFULLY!');

    // 5. Verify final counts
    const prodRes = await client.query('SELECT count(*) as c FROM products');
    const revRes = await client.query('SELECT count(*) as c FROM reviews');
    const catBreakdown = await client.query(`
      SELECT c.name as category, count(p.id) as count 
      FROM categories c 
      LEFT JOIN products p ON p.category_id = c.id 
      GROUP BY c.name 
      ORDER BY count DESC
    `);
    const genderBreakdown = await client.query(`
      SELECT gender, count(id) as count 
      FROM products 
      GROUP BY gender 
      ORDER BY count DESC
    `);

    console.log('\n📊 DATABASE SUMMARY:');
    console.log(`   Total Products in DB: ${prodRes.rows[0].c}`);
    console.log(`   Total Reviews in DB:  ${revRes.rows[0].c}`);
    console.log('\n   By Category:');
    catBreakdown.rows.forEach(r => console.log(`     - ${r.category}: ${r.count} products`));
    console.log('\n   By Gender:');
    genderBreakdown.rows.forEach(r => console.log(`     - ${r.gender}: ${r.count} products`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Sync failed, transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

sync();
