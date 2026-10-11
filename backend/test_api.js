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
    if (health.status !== 200 || health.body?.status !== 'ok') throw new Error('Health check failed');

    // 2. Categories
    const categories = await request('/api/categories');
    console.log('2. /api/categories ->', categories.status, `count: ${categories.body.categories?.length}`);
    if (categories.status !== 200 || !Array.isArray(categories.body?.categories)) throw new Error('Categories check failed');

    // 3. Products
    const products = await request('/api/products');
    console.log('3. /api/products ->', products.status, `total: ${products.body.total}, returned: ${products.body.products?.length}`);
    if (products.status !== 200 || !Array.isArray(products.body?.products)) throw new Error('Products check failed');
    // 4. Bundles
    const bundles = await request('/api/bundles');
    console.log('4. /api/bundles ->', bundles.status, `count: ${bundles.body.bundles?.length}`);
    if (bundles.status !== 200 || !Array.isArray(bundles.body?.bundles)) throw new Error('Bundles check failed');

    // 5. Auth Login
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
      }
    });
    console.log('5. /api/auth/login ->', login.status, login.body.message || login.body.error);
    const token = login.body.token;
    if (login.status !== 200 || typeof token !== 'string') throw new Error('Administrator login check failed');

    // 6. Admin Dashboard with Token
    if (token) {
      const adminDash = await request('/api/admin/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('6. /api/admin/dashboard ->', adminDash.status);
      if (adminDash.status !== 200 || !adminDash.body.stats) throw new Error('Admin dashboard check failed');
    }

    console.log('\n🎉 ALL PostgreSQL API TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

runTests();
