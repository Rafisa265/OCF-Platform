// test_product_delete.js — Comprehensive verification for DELETE /api/admin/products/:id
require('dotenv').config();
if (typeof process.env.ADMIN_PASSWORD !== 'string' || !process.env.ADMIN_PASSWORD.trim()) {
  console.error('ADMIN_PASSWORD is required to run the product deletion integration test.');
  process.exit(1);
}

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const pathLib = require('path');
const app = require('./server');
const { pool, query, queryOne, run } = require('./database/db');

const PORT = 5002;
const BASE = `http://localhost:${PORT}`;
const UPLOAD_DIR = pathLib.join(__dirname, 'uploads');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (method === 'POST' && path === '/api/orders') headers['Idempotency-Key'] = crypto.randomUUID();

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

let passed = 0;
let failed = 0;
function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 1000)); // wait for DB init

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🗑️  DELETE /api/admin/products/:id — Integration Tests');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 1. Log in as admin
    const adminLogin = await request('POST', '/api/auth/login', {
      email: process.env.ADMIN_EMAIL || 'admin@oromoculturalfashion.com',
      password: process.env.ADMIN_PASSWORD
    });
    const adminToken = adminLogin.body?.token;
    assert('Admin login succeeded', !!adminToken, `status ${adminLogin.status}`);

    // 2. Register/login as regular customer
    const userEmail = `del_test_user_${Date.now()}@ocf.test`;
    const regRes = await request('POST', '/api/auth/register', {
      name: 'Regular Customer',
      email: userEmail,
      password: 'Password123!',
      phone: '+251900112233',
      country: 'Ethiopia'
    });
    const customerToken = regRes.body?.token;
    assert('Regular customer login succeeded', !!customerToken, `status ${regRes.status}`);

    // Create a dummy image file in uploads
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const dummyImageName1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg';
    const dummyImagePath1 = pathLib.join(UPLOAD_DIR, dummyImageName1);
    fs.writeFileSync(dummyImagePath1, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));

    const sharedImageName = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
    const sharedImagePath = pathLib.join(UPLOAD_DIR, sharedImageName);
    fs.writeFileSync(sharedImagePath, Buffer.from([0x89, 0x50, 0x4E, 0x47]));

    // 3. Create Product 1 (will be deleted, has dummyImageName1 and sharedImageName)
    const prod1Res = await request('POST', '/api/admin/products', {
      name: 'Delete Target Shirt',
      slug: `delete-target-shirt-${Date.now()}`,
      description: 'Product meant to be safely deleted in tests',
      price: 4500,
      stock: 10,
      category_id: 1,
      images: [`/uploads/${dummyImageName1}`, `/uploads/${sharedImageName}`]
    }, adminToken);
    const prod1Id = prod1Res.body?.id;
    assert('Created target test product', prod1Res.status === 201 && !!prod1Id, `id=${prod1Id}`);

    // 4. Create Product 2 (shares sharedImageName)
    const prod2Res = await request('POST', '/api/admin/products', {
      name: 'Shared Image Keeper Shirt',
      slug: `keeper-shirt-${Date.now()}`,
      description: 'Product that shares the image to test retention',
      price: 5200,
      stock: 5,
      category_id: 1,
      images: [`/uploads/${sharedImageName}`]
    }, adminToken);
    const prod2Id = prod2Res.body?.id;
    assert('Created keeper product sharing image', prod2Res.status === 201 && !!prod2Id);

    // 5. Create an order containing Product 1 to test order integrity
    const orderRes = await request('POST', '/api/orders', {
      items: [{ product_id: prod1Id, quantity: 1, size: 'L' }],
      shipping: {
        name: 'Order Integrity Customer',
        email: userEmail,
        phone: '+251900112233',
        address: 'Bole Road',
        city: 'Addis Ababa',
        state: 'Oromia',
        zip: '1000',
        country: 'Ethiopia'
      },
      payment_method: 'telebirr'
    }, customerToken);
    const orderId = orderRes.body?.order?.id;
    assert('Created order with target product', orderRes.status === 201 && !!orderId);

    console.log('\n── Test Cases ─────────────────────────────────────────');

    // Test 1: Unauthenticated DELETE → 401
    const unauthRes = await request('DELETE', `/api/admin/products/${prod1Id}`);
    assert('1. Unauthenticated DELETE → 401', unauthRes.status === 401, `got ${unauthRes.status}`);

    // Test 2: Normal user DELETE → 403
    const normalUserRes = await request('DELETE', `/api/admin/products/${prod1Id}`, null, customerToken);
    assert('2. Normal user DELETE → 403', normalUserRes.status === 403, `got ${normalUserRes.status}`);

    // Test 3: Invalid product ID → 400
    const invalidIdRes1 = await request('DELETE', '/api/admin/products/invalid-id', null, adminToken);
    assert('3a. Invalid non-numeric product ID → 400', invalidIdRes1.status === 400, `got ${invalidIdRes1.status}`);

    const invalidIdRes2 = await request('DELETE', '/api/admin/products/-5', null, adminToken);
    assert('3b. Negative product ID → 400', invalidIdRes2.status === 400, `got ${invalidIdRes2.status}`);

    // Test 4: Non-existent product ID → 404
    const notFoundRes = await request('DELETE', '/api/admin/products/99999999', null, adminToken);
    assert('4. Non-existent product ID → 404', notFoundRes.status === 404, `got ${notFoundRes.status}`);

    // Test 5: Admin successfully deletes product → 200
    const delRes = await request('DELETE', `/api/admin/products/${prod1Id}`, null, adminToken);
    assert('5. Admin successfully deletes product → 200', delRes.status === 200, `got ${delRes.status}`);
    assert('Response contains confirmation message', delRes.body?.message?.includes('deleted successfully'));

    // Test 6: Deleted product no longer appears in admin product list
    const listRes = await request('GET', '/api/admin/products', null, adminToken);
    const foundInList = (listRes.body?.products || []).some(p => p.id === prod1Id);
    assert('6. Deleted product no longer in admin product list', !foundInList);

    // Test 7: Existing orders and historical order items remain intact
    const checkOrderRes = await request('GET', `/api/orders/${orderId}`, null, customerToken);
    assert('7a. Order still exists after product deletion', checkOrderRes.status === 200 && checkOrderRes.body?.order?.id === orderId);
    const orderItems = checkOrderRes.body?.items || [];
    assert('7b. Order items row still intact', orderItems.length > 0 && orderItems[0].name === 'Delete Target Shirt');
    assert('7c. Order item total intact', parseFloat(orderItems[0].price) === 4500);

    // Test 8: Existing image behavior remains safe
    // dummyImageName1 had 0 other references -> should be deleted
    const img1Exists = fs.existsSync(dummyImagePath1);
    assert('8a. Orphan image deleted from disk safely', !img1Exists);

    // sharedImageName is still referenced by prod2Id -> should NOT be deleted
    const img2Exists = fs.existsSync(sharedImagePath);
    assert('8b. Shared image retained on disk safely', img2Exists);

    // Cleanup prod2 & files
    await request('DELETE', `/api/admin/products/${prod2Id}`, null, adminToken);
    try { if (fs.existsSync(sharedImagePath)) fs.unlinkSync(sharedImagePath); } catch {}
    try { if (fs.existsSync(dummyImagePath1)) fs.unlinkSync(dummyImagePath1); } catch {}

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`Results: ${passed} passed / ${failed} failed`);
    if (!failed) console.log('🎉 ALL PRODUCT DELETE TESTS PASSED!');
    else console.log('⚠️ Some tests failed.');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('Test execution error; details withheld.');
    failed++;
  } finally {
    server.close();
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
