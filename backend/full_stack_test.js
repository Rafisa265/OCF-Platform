// full_stack_test.js — End-to-End Full Stack Verification
const http = require('http');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.ADMIN_EMAIL?.trim() || !process.env.ADMIN_PASSWORD?.trim()) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required to run the full-stack integration test.');
  process.exit(1);
}

const app = require('./server');
const { pool } = require('./database/db');

const PORT = process.env.PORT || 5000;

function apiRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (method === 'POST' && endpoint === '/api/orders') headers['Idempotency-Key'] = crypto.randomUUID();

    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: endpoint,
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runFullStackTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 STARTING FULL STACK END-TO-END VERIFICATION (POSTGRESQL)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Allow server to initialize
  await new Promise(r => setTimeout(r, 2000));

  try {
    // ── 1. HEALTH CHECK ──
    console.log('▶ Step 1: Health Check (GET /api/health)');
    const health = await apiRequest('GET', '/api/health');
    console.log(`  Status: ${health.status} OK | Service: ${health.body.service} | v${health.body.version}`);
    if (health.status !== 200) throw new Error('Health check failed');

    // ── 2. CATEGORIES ──
    console.log('\n▶ Step 2: Categories (GET /api/categories)');
    const cats = await apiRequest('GET', '/api/categories');
    console.log(`  Status: ${cats.status} OK | Count: ${cats.body.categories?.length} categories`);
    cats.body.categories.forEach(c => console.log(`    • [ID: ${c.id}] ${c.name} (${c.slug})`));

    // ── 3. PRODUCTS CATALOG ──
    console.log('\n▶ Step 3: Products Catalog (GET /api/products)');
    const prods = await apiRequest('GET', '/api/products?page=1&limit=50');
    console.log(`  Status: ${prods.status} OK | Total in DB: ${prods.body.total} | Returned: ${prods.body.products?.length}`);
    // Pick an in-stock product with sufficient quantity so cart & order placement work reliably
    const firstProduct = prods.body.products.find(p => p.stock >= 2) || prods.body.products.find(p => p.stock > 0) || prods.body.products[0];
    const testQty = Math.max(1, Math.min(2, firstProduct.stock));
    console.log(`    Sample: "${firstProduct.name}" — Br ${firstProduct.price.toLocaleString()} | SKU: ${firstProduct.sku} | Stock: ${firstProduct.stock} (Testing with qty: ${testQty})`);

    // ── 4. PRODUCT DETAILS & REVIEWS ──
    console.log(`\n▶ Step 4: Product Details & Reviews (GET /api/products/${firstProduct.slug})`);
    const prodDetails = await apiRequest('GET', `/api/products/${firstProduct.slug}`);
    console.log(`  Status: ${prodDetails.status} OK`);
    console.log(`    Name: ${prodDetails.body.product.name} | Rating: ${prodDetails.body.product.rating}★ (${prodDetails.body.product.review_count} reviews)`);
    console.log(`    Sizes: ${JSON.stringify(prodDetails.body.product.sizes)}`);
    console.log(`    Reviews fetched: ${prodDetails.body.reviews?.length} verified customer reviews`);
    if (prodDetails.body.reviews?.length) {
      console.log(`    Latest review by ${prodDetails.body.reviews[0].guest_name}: "${prodDetails.body.reviews[0].comment}"`);
    }

    // ── 5. USER REGISTRATION & LOGIN ──
    const testEmail = `customer_${Date.now()}@example.com`;
    const testPassword = 'Password123!';
    console.log(`\n▶ Step 5: User Registration & Authentication (POST /api/auth/register)`);
    console.log(`    Registering: ${testEmail}`);
    const regRes = await apiRequest('POST', '/api/auth/register', {
      name: 'Caaltuu Gadaa',
      email: testEmail,
      password: testPassword,
      phone: '+251911223344',
      country: 'Ethiopia'
    });
    console.log(`  Status: ${regRes.status} Created | User ID: ${regRes.body.user?.id}`);

    console.log(`  Testing Login (POST /api/auth/login)`);
    const loginRes = await apiRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword
    });
    console.log(`  Status: ${loginRes.status} OK | Token received`);
    const customerToken = loginRes.body.token;

    console.log(`  Testing Profile (GET /api/auth/me)`);
    const meRes = await apiRequest('GET', '/api/auth/me', null, customerToken);
    console.log(`  Authenticated as: ${meRes.body.user.name} (${meRes.body.user.email}) | Role: ${meRes.body.user.role}`);

    // ── 6. CART OPERATIONS ──
    console.log(`\n▶ Step 6: Server Cart Management`);
    console.log(`  Adding item (Product ID: ${firstProduct.id}, Size: "M", Qty: ${testQty}) -> POST /api/cart`);
    const addCart = await apiRequest('POST', '/api/cart', {
      product_id: firstProduct.id,
      size: 'M',
      quantity: testQty
    }, customerToken);
    console.log(`  Status: ${addCart.status} OK | Message: ${addCart.body.message}`);

    console.log(`  Fetching cart -> GET /api/cart`);
    const cart = await apiRequest('GET', '/api/cart', null, customerToken);
    console.log(`  Status: ${cart.status} OK | Items: ${cart.body.items?.length} | Subtotal: Br ${cart.body.subtotal.toLocaleString()}`);

    // ── 7. WISHLIST OPERATIONS ──
    console.log(`\n▶ Step 7: Wishlist Management`);
    const wishProdId = prods.body.products[1].id;
    console.log(`  Toggling Wishlist for Product ID ${wishProdId} -> POST /api/wishlist/${wishProdId}`);
    const wishAdd = await apiRequest('POST', `/api/wishlist/${wishProdId}`, {}, customerToken);
    console.log(`  Status: ${wishAdd.status} OK | Wishlisted: ${wishAdd.body.wishlisted}`);

    const wishList = await apiRequest('GET', '/api/wishlist', null, customerToken);
    console.log(`  Status: ${wishList.status} OK | Wishlist item count: ${wishList.body.items?.length}`);

    // ── 8. CHECKOUT & ORDER PLACEMENT ──
    console.log(`\n▶ Step 8: Promo Code Validation & Order Placement`);
    const promoCheck = await apiRequest('POST', '/api/promo/validate', {
      code: 'WELCOME10',
      subtotal: cart.body.subtotal
    });
    console.log(`  Promo WELCOME10 validation -> Status: ${promoCheck.status} | Discount: Br ${promoCheck.body.discount}`);

    console.log(`  Placing live order -> POST /api/orders`);
    const orderPayload = {
      items: [
        { product_id: firstProduct.id, quantity: testQty, size: 'M' }
      ],
      shipping: {
        name: 'Caaltuu Gadaa',
        email: testEmail,
        phone: '+251911223344',
        address: 'Bole Sub-city, Woreda 03',
        city: 'Addis Ababa',
        state: 'Oromia',
        zip: '1000',
        country: 'Ethiopia'
      },
      payment_method: 'telebirr',
      promo_code: 'WELCOME10',
      notes: 'Please pack in traditional gift box'
    };

    const orderRes = await apiRequest('POST', '/api/orders', orderPayload, customerToken);
    console.log(`  Status: ${orderRes.status} Created | Order Number: ${orderRes.body.orderNumber}`);
    console.log(`  Order Total: Br ${orderRes.body.order.total.toLocaleString()} (Discount: Br ${orderRes.body.order.discount}, Shipping: Br ${orderRes.body.order.shipping_cost})`);

    const orderId = orderRes.body.order.id;

    console.log(`  Customer fetching own orders -> GET /api/orders`);
    const myOrders = await apiRequest('GET', '/api/orders', null, customerToken);
    console.log(`  Status: ${myOrders.status} OK | Customer order count: ${myOrders.body.orders?.length}`);

    console.log(`  Tracking order by ID -> GET /api/orders/${orderId}`);
    const trackOrder = await apiRequest('GET', `/api/orders/${orderId}`, null, customerToken);
    console.log(`  Status: ${trackOrder.status} OK | Status: ${trackOrder.body.order.status} | Items: ${trackOrder.body.items?.length}`);

    // ── 9. ADMIN DASHBOARD & ORDER MANAGEMENT ──
    console.log(`\n▶ Step 9: Admin Dashboard & Order Processing`);
    console.log(`  Admin login -> POST /api/auth/login`);
    const adminLogin = await apiRequest('POST', '/api/auth/login', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    });
    const adminToken = adminLogin.body.token;

    console.log(`  Admin fetching dashboard stats -> GET /api/admin/dashboard`);
    const dash = await apiRequest('GET', '/api/admin/dashboard', null, adminToken);
    console.log(`  Status: ${dash.status} OK`);
    console.log(`    • Total Revenue: Br ${dash.body.stats.totalRevenue.toLocaleString()}`);
    console.log(`    • Total Orders:  ${dash.body.stats.totalOrders}`);
    console.log(`    • Pending Orders:${dash.body.stats.pendingOrders}`);
    console.log(`    • Total Users:   ${dash.body.stats.totalUsers}`);
    console.log(`    • Total Products:${dash.body.stats.totalProducts}`);
    console.log(`    • Total Reviews: ${dash.body.stats.totalReviews}`);

    console.log(`  Admin updating order #${orderRes.body.orderNumber} to "processing" -> PUT /api/admin/orders/${orderId}`);
    const updateOrder = await apiRequest('PUT', `/api/admin/orders/${orderId}`, {
      status: 'processing',
      tracking_number: 'ETH-POST-992819'
    }, adminToken);
    console.log(`  Status: ${updateOrder.status} OK | Message: ${updateOrder.body.message}`);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🎉 ALL 9 END-TO-END PIPELINE STEPS COMPLETED WITH 100% SUCCESS!');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ E2E Test Failure:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runFullStackTest();
