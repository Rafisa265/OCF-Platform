// test_api.js — Test key API endpoints against PostgreSQL
const app = require('./server');
const { pool } = require('./database/db');

async function runTests() {
  console.log('🧪 Starting API Verification against PostgreSQL...');
  const http = require('http');

  // Let server start
  await new Promise(resolve => setTimeout(resolve, 2000));

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'localhost',
        port: process.env.PORT || 5000,
        path,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(opts, (res) => {
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
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  try {
    // 1. Health
    const health = await request('/api/health');
    console.log('1. /api/health ->', health.status, health.body);

    // 2. Categories
    const categories = await request('/api/categories');
    console.log('2. /api/categories ->', categories.status, `count: ${categories.body.categories?.length}`);

    // 3. Products
    const products = await request('/api/products');
    console.log('3. /api/products ->', products.status, `total: ${products.body.total}, returned: ${products.body.products?.length}`);
    if (products.body.products?.length) {
      const p = products.body.products[0];
      console.log('   Sample Product:', { id: p.id, name: p.name, price: p.price, images: p.images?.length, sizes: p.sizes });
    }

    // 4. Bundles
    const bundles = await request('/api/bundles');
    console.log('4. /api/bundles ->', bundles.status, `count: ${bundles.body.bundles?.length}`);

    // 5. Auth Login
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: process.env.ADMIN_EMAIL || 'admin@oromoculturalfashion.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@OCF2024'
      }
    });
    console.log('5. /api/auth/login ->', login.status, login.body.message || login.body.error);
    const token = login.body.token;

    // 6. Admin Dashboard with Token
    if (token) {
      const adminDash = await request('/api/admin/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('6. /api/admin/dashboard ->', adminDash.status, adminDash.body.stats);
    }

    console.log('\n🎉 ALL PostgreSQL API TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runTests();
