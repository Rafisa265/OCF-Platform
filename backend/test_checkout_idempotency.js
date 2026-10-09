process.env.NODE_ENV = 'test';
require('dotenv').config();

const crypto = require('crypto');
const http = require('http');
const app = require('./server');
const { pool } = require('./database/db');

let server;
let base;
let userId;
let categoryId;
let productId;
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function request(method, route, body, token, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const url = new URL(base + route);
    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const req = http.request(url, { method, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}/api`;

    const suffix = crypto.randomUUID();
    const email = `idempotency-${suffix}@ocf.test`;
    const password = `Idempotency-${crypto.randomBytes(12).toString('hex')}!`;
    const registered = await request('POST', '/auth/register', {
      name: 'Idempotency Test Customer',
      email,
      password
    });
    userId = registered.body.user?.id;
    const token = registered.body.token;
    assert('Test customer registered', registered.status === 201 && !!userId && !!token, `HTTP ${registered.status}`);
    if (!token) throw new Error('Could not create the isolated test customer');

    const category = await pool.query(
      'INSERT INTO categories (name, name_en, name_om, slug) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Idempotency Test Category', 'Idempotency Test Category', 'Ramaddii Qormaata Idempotency', `idempotency-category-${suffix}`]
    );
    categoryId = category.rows[0].id;
    const product = await pool.query(
      `INSERT INTO products (name, name_en, name_om, slug, price, stock, category_id, is_active)
       VALUES ($1, $2, $3, $4, 250.50, 10, $5, true) RETURNING id`,
      ['Idempotency Test Product', 'Idempotency Test Product', 'Oomisha Qormaata Idempotency', `idempotency-product-${suffix}`, categoryId]
    );
    productId = product.rows[0].id;

    const checkout = {
      items: [{ product_id: productId, quantity: 2, size: 'M' }],
      shipping: {
        name: 'Idempotency Test Customer',
        email,
        phone: '+251900000001',
        address: 'Test Street 1',
        city: 'Addis Ababa',
        country: 'Ethiopia'
      },
      payment_method: 'cash_on_delivery'
    };

    const missingKey = await request('POST', '/orders', checkout, token);
    assert('Checkout without idempotency key is rejected', missingKey.status === 400, `HTTP ${missingKey.status}`);

    const normalKey = crypto.randomUUID();
    const normal = await request('POST', '/orders', checkout, token, normalKey);
    assert('Normal checkout succeeds', normal.status === 201 && !!normal.body.order?.id, `HTTP ${normal.status}`);
    assert('Normal checkout total is correct', Number(normal.body.order?.subtotal) === 501 &&
      Number(normal.body.order?.shipping_cost) === 800 && Number(normal.body.order?.total) === 1301,
    `subtotal=${normal.body.order?.subtotal}; shipping=${normal.body.order?.shipping_cost}; total=${normal.body.order?.total}`);

    const normalReplay = await request('POST', '/orders', checkout, token, normalKey);
    assert('Sequential replay returns original order safely', normalReplay.status === 200 &&
      normalReplay.body.replayed === true && normalReplay.body.order?.id === normal.body.order?.id,
    `HTTP ${normalReplay.status}; replayed=${normalReplay.body.replayed}`);

    const concurrentKey = crypto.randomUUID();
    const concurrent = await Promise.all([
      request('POST', '/orders', checkout, token, concurrentKey),
      request('POST', '/orders', checkout, token, concurrentKey)
    ]);
    const successful = concurrent.filter(result => result.status === 201);
    const replayed = concurrent.filter(result => result.status === 200 && result.body.replayed === true);
    assert('Concurrent identical checkout requests produce one creation and one replay', successful.length === 1 && replayed.length === 1,
      `HTTP statuses ${concurrent.map(result => result.status).join(', ')}`);
    assert('Both concurrent responses identify the same order', successful.length === 1 && replayed.length === 1 &&
      successful[0].body.order.id === replayed[0].body.order.id,
    'response order IDs must match');

    const mismatch = await request('POST', '/orders', {
      ...checkout,
      items: [{ product_id: productId, quantity: 1, size: 'M' }]
    }, token, concurrentKey);
    assert('Reusing a key for a different checkout returns 409', mismatch.status === 409, `HTTP ${mismatch.status}`);

    const savedOrders = await pool.query('SELECT id FROM orders WHERE user_id = $1', [userId]);
    assert('Only two orders exist: one normal checkout and one concurrent checkout', savedOrders.rowCount === 2,
      `found ${savedOrders.rowCount}`);
    const inventory = await pool.query('SELECT stock FROM products WHERE id = $1', [productId]);
    assert('Inventory was deducted once per distinct checkout key', Number(inventory.rows[0]?.stock) === 6,
      `remaining stock ${inventory.rows[0]?.stock}`);
    const history = await request('GET', '/orders', undefined, token);
    assert('Customer history contains one order per distinct key', history.status === 200 && history.body.orders.length === 2,
      `HTTP ${history.status}; found ${history.body.orders?.length}`);

    console.log(`\nIdempotency integration results: ${passed} passed, ${failed} failed.`);
  } catch (error) {
    failed++;
    console.error(`❌ Idempotency test error: ${error.message}`);
  } finally {
    try {
      if (userId) await pool.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      if (productId) await pool.query('DELETE FROM products WHERE id = $1', [productId]);
      if (categoryId) await pool.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    } catch (error) {
      failed++;
      console.error(`❌ Test fixture cleanup failed: ${error.message}`);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end().catch(() => {});
    process.exitCode = failed ? 1 : 0;
  }
}

main();
