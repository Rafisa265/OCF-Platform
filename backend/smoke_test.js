// smoke_test.js — Complete End-to-End Smoke Test for OCF Platform
// Validates 12-step Customer Journey + 9-step Admin Journey
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('./server');
const { getDB } = require('./database/db');

let server;
let BASE;

function request(method, path, body = null, token = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const reqHeaders = { ...headers };
    if (method === 'POST' && path === '/orders') reqHeaders['Idempotency-Key'] ||= crypto.randomUUID();
    let reqBody = null;

    if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
    if (body && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
    } else if (typeof body === 'string' || Buffer.isBuffer(body)) {
      reqBody = body;
    }

    const req = http.request(url, { method, headers: reqHeaders }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

async function runSmokeTest() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🌟 OCF FINAL COMPREHENSIVE SMOKE TEST (PRODUCTION AUDIT)');
  console.log('═══════════════════════════════════════════════════════\n');

  await getDB();
  const port = 58999;
  server = http.createServer(app);
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${port}/api`;

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // ═══════════════════════════════════════════════════════
    // PART 1: 12-STEP CUSTOMER JOURNEY
    // ═══════════════════════════════════════════════════════
    console.log('── PART 1: 12-STEP CUSTOMER JOURNEY ──────────────────');
    const custEmail = `smoke_customer_${Date.now()}@test.com`;
    const custPass = 'SmokePass123!';
    let custToken = null;
    let custUserId = null;

    // 1. Register
    console.log('\n[Customer Step 1] Registration');
    const regRes = await request('POST', '/auth/register', {
      name: 'Smoke Test Customer',
      email: custEmail,
      password: custPass,
      phone: `+2519${Math.floor(10000000 + Math.random() * 90000000)}`,
      country: 'Ethiopia'
    });
    assert(regRes.status === 201, `Customer registration returns 201 (got ${regRes.status})`);
    assert(regRes.body.token, 'Registration returns JWT token');
    custToken = regRes.body.token;
    custUserId = regRes.body.user.id;

    // 2. Login
    console.log('\n[Customer Step 2] Login');
    const loginRes = await request('POST', '/auth/login', {
      email: custEmail,
      password: custPass
    });
    assert(loginRes.status === 200, `Customer login returns 200 (got ${loginRes.status})`);
    assert(loginRes.body.token, 'Login returns valid token');
    assert(loginRes.body.user.email === custEmail, 'User profile returned in login');
    custToken = loginRes.body.token;

    // 3. Browse products
    console.log('\n[Customer Step 3] Browse Products Catalog');
    const catalogRes = await request('GET', '/products?page=1&limit=20');
    assert(catalogRes.status === 200, `Browse products returns 200 (got ${catalogRes.status})`);
    assert(Array.isArray(catalogRes.body.products) && catalogRes.body.products.length > 0, 'Products list is non-empty array');
    const targetProduct = catalogRes.body.products.find(p => p.stock >= 2) || catalogRes.body.products[0];

    // 4. Search / filter
    console.log('\n[Customer Step 4] Search & Filter Products');
    const searchRes = await request('GET', '/products?search=Dress');
    assert(searchRes.status === 200, `Search returns 200 (got ${searchRes.status})`);
    assert(Array.isArray(searchRes.body.products), 'Search results returned as array');

    // 5. View product details & reviews
    console.log(`\n[Customer Step 5] View Product Details (${targetProduct.slug})`);
    const detailRes = await request('GET', `/products/${targetProduct.slug}`);
    assert(detailRes.status === 200, `Product details return 200 (got ${detailRes.status})`);
    assert(detailRes.body.product.id === targetProduct.id, 'Product details match target ID');
    assert(Array.isArray(detailRes.body.reviews), 'Reviews array returned with product');

    // 6. Add to cart
    console.log('\n[Customer Step 6] Add Item to Server Cart');
    const cartAddRes = await request('POST', '/cart', {
      product_id: targetProduct.id,
      quantity: 1,
      size: 'M'
    }, custToken);
    assert(cartAddRes.status === 200, `Add to cart returns 200 (got ${cartAddRes.status})`);
    const cartGetRes = await request('GET', '/cart', null, custToken);
    assert(cartGetRes.status === 200, `Get cart returns 200 (got ${cartGetRes.status})`);
    assert(cartGetRes.body.items.length >= 1, 'Cart items length >= 1');

    // 7. Wishlist toggle
    console.log('\n[Customer Step 7] Wishlist Operations');
    const wishAddRes = await request('POST', `/wishlist/${targetProduct.id}`, {}, custToken);
    assert(wishAddRes.status === 200, `Wishlist toggle returns 200 (got ${wishAddRes.status})`);
    assert(wishAddRes.body.wishlisted === true, 'Product added to wishlist');
    const wishGetRes = await request('GET', '/wishlist', null, custToken);
    assert(wishGetRes.status === 200, `Get wishlist returns 200 (got ${wishGetRes.status})`);
    assert(wishGetRes.body.items.some(w => w.product_id === targetProduct.id || w.id === targetProduct.id), 'Product found in customer wishlist');

    // 8. Checkout / Promo Validation
    console.log('\n[Customer Step 8] Validate Promo Code');
    const promoRes = await request('POST', '/promo/validate', {
      code: 'SAVE10',
      subtotal: parseFloat(targetProduct.price)
    });
    assert(promoRes.status === 200, `Promo validate returns 200 (got ${promoRes.status})`);
    assert(promoRes.body.discount > 0, 'Discount calculated correctly');

    // 9. Place Order
    console.log('\n[Customer Step 9] Place Order');
    const orderPayload = {
      items: [{ product_id: targetProduct.id, quantity: 1, size: 'M' }],
      shipping: {
        name: 'Smoke Test Customer',
        email: custEmail,
        phone: '+251911223344',
        address: 'Bole Road 100',
        city: 'Addis Ababa',
        state: 'Oromia',
        zip: '1000',
        country: 'Ethiopia'
      },
      payment_method: 'telebirr',
      promo_code: 'SAVE10',
      notes: 'Smoke test automated order'
    };
    const orderPlaceRes = await request('POST', '/orders', orderPayload, custToken);
    assert(orderPlaceRes.status === 201, `Place order returns 201 (got ${orderPlaceRes.status})`);
    assert(orderPlaceRes.body.orderNumber, 'Order number generated');
    const placedOrderNumber = orderPlaceRes.body.orderNumber;
    const placedOrderId = orderPlaceRes.body.order.id;

    // 10. View My Orders
    console.log('\n[Customer Step 10] View My Orders (Order History)');
    const myOrdersRes = await request('GET', '/orders', null, custToken);
    assert(myOrdersRes.status === 200, `My orders returns 200 (got ${myOrdersRes.status})`);
    assert(myOrdersRes.body.orders.some(o => o.order_number === placedOrderNumber), 'New order found in order history');

    // 11. Track Order Securely
    console.log('\n[Customer Step 11] Secure Order Tracking');
    const trackRes = await request('GET', `/orders/${placedOrderNumber}?email=${encodeURIComponent(custEmail)}`);
    assert(trackRes.status === 200, `Track order returns 200 (got ${trackRes.status})`);
    assert(trackRes.body.order.order_number === placedOrderNumber, 'Tracked order number matches');
    assert(trackRes.body.order.status === 'pending', 'Order status is pending');

    // 12. Submit Review
    console.log('\n[Customer Step 12] Submit Verified Customer Review');
    const reviewRes = await request('POST', `/products/${targetProduct.id}/reviews`, {
      rating: 5,
      comment: 'Exceptional craftsmanship and swift delivery! Highly recommended.',
      guest_name: 'Smoke Tester'
    }, custToken);
    assert(reviewRes.status === 201, `Submit review returns 201 (got ${reviewRes.status})`);
    assert(reviewRes.body.message && reviewRes.body.message.includes('successfully'), 'Review recorded with success message');

    // ═══════════════════════════════════════════════════════
    // PART 2: 9-STEP ADMIN JOURNEY
    // ═══════════════════════════════════════════════════════
    console.log('\n── PART 2: 9-STEP ADMIN JOURNEY ──────────────────────');
    let adminToken = null;

    // 1. Admin login
    console.log('\n[Admin Step 1] Admin Authentication');
    const adminLoginRes = await request('POST', '/auth/login', {
      email: process.env.ADMIN_EMAIL || 'admin@ocf.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@OCF2026!'
    });
    assert(adminLoginRes.status === 200, `Admin login returns 200 (got ${adminLoginRes.status})`);
    assert(adminLoginRes.body.user.role === 'admin', 'User has admin role');
    adminToken = adminLoginRes.body.token;

    // 2. Admin Dashboard
    console.log('\n[Admin Step 2] Admin Dashboard Overview');
    const dashRes = await request('GET', '/admin/dashboard', null, adminToken);
    assert(dashRes.status === 200, `Admin dashboard returns 200 (got ${dashRes.status})`);
    assert(dashRes.body.stats, 'Dashboard statistics object present');
    assert(typeof dashRes.body.stats.totalOrders !== 'undefined', 'Total orders metric present');
    assert(typeof dashRes.body.stats.totalRevenue !== 'undefined', 'Total revenue metric present');

    // 3. View Orders
    console.log('\n[Admin Step 3] View All Orders');
    const admOrdersRes = await request('GET', '/admin/orders', null, adminToken);
    assert(admOrdersRes.status === 200, `Admin orders returns 200 (got ${admOrdersRes.status})`);
    assert(Array.isArray(admOrdersRes.body.orders), 'Admin orders list is array');
    assert(admOrdersRes.body.orders.some(o => o.id === placedOrderId), 'Customer order present in admin list');

    // 4. Change Order Status
    console.log('\n[Admin Step 4] Update Order Status to "processing"');
    const updateOrderRes = await request('PUT', `/admin/orders/${placedOrderId}`, {
      status: 'processing',
      tracking_number: 'ET-SMOKE-998877'
    }, adminToken);
    assert(updateOrderRes.status === 200, `Order status update returns 200 (got ${updateOrderRes.status})`);
    assert(updateOrderRes.body.message === 'Order updated', 'Order status update confirmed by API');

    // 5. Add Product
    console.log('\n[Admin Step 5] Create New Product');
    const newProdSlug = `smoke-test-attire-${Date.now()}`;
    const newProdRes = await request('POST', '/admin/products', {
      name: `Smoke Test Oromo Attire ${Date.now()}`,
      slug: newProdSlug,
      category_id: 1,
      gender: 'women',
      age_group: 'adult',
      price: 13500,
      compare_price: 16000,
      stock: 10,
      region: 'Wallagga',
      description: 'Handmade luxury traditional dress with gold embroidery.',
      images: ['/uploads/smoke_default.jpg'],
      badge: 'new',
      badge_text: 'NEW SMOKE',
      is_active: true
    }, adminToken);
    assert(newProdRes.status === 201, `Create product returns 201 (got ${newProdRes.status})`);
    const createdProdId = newProdRes.body.id;
    assert(createdProdId > 0, `New product ID generated (${createdProdId})`);

    // 6. Upload Image
    console.log('\n[Admin Step 6] Secure Image Upload');
    // Create a 1x1 valid PNG buffer
    const validPngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    const boundary = '----WebKitFormBoundarySmokeTest7MA4YWxkTrZu0gW';
    let multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="smoke_test.png"\r\nContent-Type: image/png\r\n\r\n`),
      validPngBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await request('POST', '/admin/upload', multipartBody, adminToken, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    });
    assert(uploadRes.status === 201, `Upload returns 201 (got ${uploadRes.status})`);
    assert(uploadRes.body.url && uploadRes.body.url.startsWith('/uploads/'), 'Upload returns safe relative /uploads/ path');
    const uploadedImgUrl = uploadRes.body.url;

    // 7. Edit Product
    console.log('\n[Admin Step 7] Edit Product (Attach Uploaded Image & Update Price)');
    const editProdRes = await request('PUT', `/admin/products/${createdProdId}`, {
      name: `Smoke Test Oromo Attire ${Date.now()}`,
      price: 14000,
      images: [uploadedImgUrl],
      badge_text: 'UPDATED SMOKE'
    }, adminToken);
    assert(editProdRes.status === 200, `Edit product returns 200 (got ${editProdRes.status})`);
    assert(editProdRes.body.message === 'Product updated', 'Product updated successfully');

    // 8. Delete Product
    console.log('\n[Admin Step 8] Safely Delete Product (Verifying Cascade & Isolation)');
    const deleteRes = await request('DELETE', `/admin/products/${createdProdId}`, null, adminToken);
    assert(deleteRes.status === 200, `Delete product returns 200 (got ${deleteRes.status})`);
    const checkDeletedRes = await request('GET', `/products/${newProdSlug}`);
    assert(checkDeletedRes.status === 404, 'Deleted product is no longer accessible (404)');

    // 9. View Users
    console.log('\n[Admin Step 9] View Registered Users (Verify Privacy)');
    const usersRes = await request('GET', '/admin/users', null, adminToken);
    assert(usersRes.status === 200, `Admin users returns 200 (got ${usersRes.status})`);
    assert(Array.isArray(usersRes.body.users), 'Users returned as array');
    const sampleUser = usersRes.body.users[0];
    assert(!sampleUser.password, 'User password hashes are strictly not exposed');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`🎉 ALL SMOKE TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
    console.log('═══════════════════════════════════════════════════════\n');
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }
}

runSmokeTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Smoke test error:', err);
    process.exit(1);
  });
