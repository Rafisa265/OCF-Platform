// routes/index.js — All OCF API Routes (PostgreSQL Async)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool, query, queryOne, run } = require('../database/db');
const { auth, adminOnly, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── Rate Limiters for Sensitive Endpoints ──────────
const isTestEnv = process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration requests. Please try again later.' }
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order requests. Please try again later.' }
});

const promoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 1000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many promo validation attempts. Please try again later.' }
});

// ── Sanitized Server Error Response Helper ────────
const sendServerError = (res, err, customMsg = 'An unexpected server error occurred') => {
  console.error(err);
  if (process.env.NODE_ENV === 'development') {
    return res.status(500).json({ error: customMsg, details: err.message });
  }
  return res.status(500).json({ error: customMsg });
};

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
const n = v => (v === undefined ? null : v);
const generateOrderNumber = () => `OCF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

const parseJSON = (val, fallback = []) => {
  if (Array.isArray(val) || (typeof val === 'object' && val !== null)) return val;
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const formatProduct = (p) => {
  if (!p) return null;
  return {
    ...p,
    price: p.price != null ? parseFloat(p.price) : 0,
    compare_price: p.compare_price != null ? parseFloat(p.compare_price) : null,
    cost_price: p.cost_price != null ? parseFloat(p.cost_price) : null,
    rating: p.rating != null ? parseFloat(p.rating) : 0,
    review_count: p.review_count != null ? parseInt(p.review_count, 10) : 0,
    stock: p.stock != null ? parseInt(p.stock, 10) : 0,
    images: parseJSON(p.images, []),
    sizes: parseJSON(p.sizes, []),
    colors: parseJSON(p.colors, [])
  };
};

const formatBundle = (b) => {
  if (!b) return null;
  return {
    ...b,
    price: b.price != null ? parseFloat(b.price) : 0,
    compare_price: b.compare_price != null ? parseFloat(b.compare_price) : null,
    savings: b.savings != null ? parseFloat(b.savings) : 0,
    discount_pct: b.discount_pct != null ? parseInt(b.discount_pct, 10) : 0,
    items: parseJSON(b.items_json, [])
  };
};

// ═══════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════

// POST /api/auth/register
router.post('/auth/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, country } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users (name,email,password,phone,country) VALUES ($1,$2,$3,$4,$5)', [name, email, hash, phone || null, country || 'Ethiopia']);
    const user = await queryOne('SELECT id, name, email, role, phone, country FROM users WHERE email = $1', [email]);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ message: 'Account created successfully', token, user });
  } catch (err) {
    sendServerError(res, err, 'Failed to register account');
  }
});

// POST /api/auth/login
router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;
    res.json({ message: 'Login successful', token, user: safeUser });
  } catch (err) {
    sendServerError(res, err, 'Failed to log in');
  }
});

// GET /api/auth/me
router.get('/auth/me', auth, async (req, res) => {
  try {
    const user = await queryOne('SELECT id,name,email,role,phone,address,city,country,avatar,created_at FROM users WHERE id = $1', [req.user.id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile
router.put('/auth/profile', auth, async (req, res) => {
  try {
    const { name, phone, address, city, country } = req.body;
    await run('UPDATE users SET name=$1,phone=$2,address=$3,city=$4,country=$5,updated_at=NOW() WHERE id=$6',
      [name || req.user.name, n(phone), n(address), n(city), n(country), req.user.id]);
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await queryOne('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    await run('UPDATE users SET password = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// CATEGORY ROUTES
// ═══════════════════════════════════════

// GET /api/categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await query('SELECT * FROM categories WHERE is_active = true ORDER BY id');
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories/:slug
router.get('/categories/:slug', async (req, res) => {
  try {
    const cat = await queryOne('SELECT * FROM categories WHERE slug = $1', [req.params.slug]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const products = (await query('SELECT * FROM products WHERE category_id = $1 AND is_active = true', [cat.id])).map(formatProduct);
    res.json({ category: cat, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// PRODUCT ROUTES
// ═══════════════════════════════════════

// GET /api/products
router.get('/products', async (req, res) => {
  try {
    const { category, region, minPrice, maxPrice, sort, search, featured, bestSeller, page = 1, limit = 12 } = req.query;
    let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = true';
    const params = [];

    if (category) { params.push(category); sql += ` AND c.slug = $${params.length}`; }
    if (region) { params.push(region); sql += ` AND p.region = $${params.length}`; }
    if (minPrice) { params.push(Number(minPrice)); sql += ` AND p.price >= $${params.length}`; }
    if (maxPrice) { params.push(Number(maxPrice)); sql += ` AND p.price <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      sql += ` AND (p.name ILIKE $${params.length - 2} OR p.description ILIKE $${params.length - 1} OR p.region ILIKE $${params.length})`;
    }
    if (featured === 'true') { sql += ' AND p.is_featured = true'; }
    if (bestSeller === 'true') { sql += ' AND p.is_best_seller = true'; }

    switch (sort) {
      case 'price-low': sql += ' ORDER BY p.price ASC'; break;
      case 'price-high': sql += ' ORDER BY p.price DESC'; break;
      case 'rating': sql += ' ORDER BY p.rating DESC, p.review_count DESC'; break;
      case 'newest': sql += ' ORDER BY p.created_at DESC'; break;
      default: sql += ' ORDER BY p.is_best_seller DESC, p.is_featured DESC, p.id';
    }

    const allProducts = (await query(sql, params)).map(formatProduct);
    const offset = (Number(page) - 1) * Number(limit);
    const paginated = allProducts.slice(offset, offset + Number(limit));
    res.json({ products: paginated, total: allProducts.length, page: Number(page), pages: Math.ceil(allProducts.length / Number(limit)) });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch products');
  }
});

// GET /api/products/featured
router.get('/products/featured', async (req, res) => {
  try {
    const products = (await query('SELECT * FROM products WHERE is_featured = true AND is_active = true ORDER BY rating DESC LIMIT 8')).map(formatProduct);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/best-sellers
router.get('/products/best-sellers', async (req, res) => {
  try {
    const products = (await query('SELECT * FROM products WHERE is_best_seller = true AND is_active = true ORDER BY review_count DESC LIMIT 8')).map(formatProduct);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:slug
router.get('/products/:slug', optionalAuth, async (req, res) => {
  try {
    const product = await queryOne('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1 AND p.is_active = true', [req.params.slug]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const reviews = await query('SELECT * FROM reviews WHERE product_id = $1 AND is_approved = true ORDER BY created_at DESC', [product.id]);
    const related = (await query('SELECT * FROM products WHERE category_id = $1 AND id != $2 AND is_active = true LIMIT 4', [product.category_id, product.id])).map(formatProduct);
    const wishlisted = req.user ? !!(await queryOne('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, product.id])) : false;
    res.json({ product: formatProduct(product), reviews, related, wishlisted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// BUNDLE ROUTES
// ═══════════════════════════════════════

// GET /api/bundles
router.get('/bundles', async (req, res) => {
  try {
    const bundles = (await query('SELECT * FROM bundles WHERE is_active = true ORDER BY is_featured DESC, id')).map(formatBundle);
    res.json({ bundles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bundles/:slug
router.get('/bundles/:slug', async (req, res) => {
  try {
    const bundle = await queryOne('SELECT * FROM bundles WHERE slug = $1 AND is_active = true', [req.params.slug]);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });
    res.json({ bundle: formatBundle(bundle) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// CART ROUTES (server-side for auth users)
// ═══════════════════════════════════════

// GET /api/cart
router.get('/cart', auth, async (req, res) => {
  try {
    const items = await query(`
      SELECT c.*, p.name, p.price, p.images, p.stock, p.region, p.slug
      FROM carts c JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1`, [req.user.id]);
    const formatted = items.map(i => ({ ...i, price: parseFloat(i.price), images: parseJSON(i.images, []) }));
    const subtotal = formatted.reduce((s, i) => s + i.price * i.quantity, 0);
    res.json({ items: formatted, subtotal, count: formatted.reduce((s, i) => s + i.quantity, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cart
router.post('/cart', auth, async (req, res) => {
  try {
    const { product_id, quantity = 1, size = 'M' } = req.body;
    const product = await queryOne('SELECT id, stock FROM products WHERE id = $1 AND is_active = true', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const existing = await queryOne('SELECT * FROM carts WHERE user_id = $1 AND product_id = $2 AND size = $3', [req.user.id, product_id, size]);
    if (existing) {
      await run('UPDATE carts SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [quantity, existing.id]);
    } else {
      await run('INSERT INTO carts (user_id, product_id, quantity, size) VALUES ($1,$2,$3,$4)', [req.user.id, product_id, quantity, size]);
    }
    res.json({ message: 'Item added to cart' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cart/:id
router.put('/cart/:id', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity < 1) {
      await run('DELETE FROM carts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return res.json({ message: 'Item removed' });
    }
    await run('UPDATE carts SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [quantity, req.params.id, req.user.id]);
    res.json({ message: 'Cart updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cart/:id
router.delete('/cart/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM carts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cart
router.delete('/cart', auth, async (req, res) => {
  try {
    await run('DELETE FROM carts WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// WISHLIST ROUTES
// ═══════════════════════════════════════

// GET /api/wishlist
router.get('/wishlist', auth, async (req, res) => {
  try {
    const items = await query(
      `SELECT w.id, w.created_at, p.id as product_id, p.name, p.price, p.compare_price, p.images, p.rating, p.region, p.slug 
       FROM wishlists w JOIN products p ON w.product_id = p.id 
       WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ items: items.map(i => ({ ...i, price: parseFloat(i.price), compare_price: i.compare_price ? parseFloat(i.compare_price) : null, images: parseJSON(i.images, []) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wishlist/:productId
router.post('/wishlist/:productId', auth, async (req, res) => {
  try {
    const exists = await queryOne('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    if (exists) {
      await run('DELETE FROM wishlists WHERE id = $1', [exists.id]);
      res.json({ message: 'Removed from wishlist', wishlisted: false });
    } else {
      await run('INSERT INTO wishlists (user_id, product_id) VALUES ($1,$2)', [req.user.id, req.params.productId]);
      res.json({ message: 'Added to wishlist', wishlisted: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// ORDER ROUTES
// ═══════════════════════════════════════

// POST /api/orders (Transactional & Rate-limited)
router.post('/orders', orderLimiter, optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, shipping, payment_method, promo_code, notes } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Order must have at least one item' });
    if (!shipping?.email || !shipping?.address) return res.status(400).json({ error: 'Shipping information required' });

    if (!shipping.email.includes('@')) {
      return res.status(400).json({ error: 'Valid shipping email required' });
    }

    // Validate quantities
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Item quantity must be a positive integer' });
      }
    }

    await client.query('BEGIN');

    // Calculate totals and verify current stock atomically
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
      const product = prodRes.rows[0];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Product ${item.product_id} not found` });
      }

      if (product.stock < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product "${product.name}" has insufficient stock (${product.stock} available)` });
      }

      const linePrice = parseFloat(product.price);
      const lineTotal = linePrice * qty;
      subtotal += lineTotal;
      orderItems.push({
        product_id: product.id,
        name: product.name,
        price: linePrice,
        quantity: qty,
        size: item.size || 'M',
        total: lineTotal
      });
    }

    // Validate promo against subtotal
    let discount = 0;
    let promoRecord = null;
    if (promo_code) {
      const pRes = await client.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE', [promo_code.toUpperCase()]);
      promoRecord = pRes.rows[0];
      if (promoRecord && subtotal >= parseFloat(promoRecord.min_order) && promoRecord.uses < promoRecord.max_uses) {
        discount = promoRecord.type === 'percent' ? subtotal * (parseFloat(promoRecord.value) / 100) : parseFloat(promoRecord.value);
      }
    }

    const shippingCost = subtotal >= 15000 ? 0 : (shipping.country === 'Ethiopia' ? 800 : 2500);
    const total = subtotal - discount + shippingCost;
    const orderNumber = generateOrderNumber();

    const insertOrderRes = await client.query(`INSERT INTO orders 
      (order_number,user_id,guest_email,subtotal,shipping_cost,discount,total,payment_method,
       shipping_name,shipping_email,shipping_phone,shipping_address,shipping_city,shipping_state,shipping_zip,shipping_country,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [orderNumber, req.user?.id || null, shipping.email, subtotal, shippingCost, discount, total,
       payment_method || 'pending', shipping.name, shipping.email, shipping.phone,
       shipping.address, shipping.city, shipping.state, shipping.zip, shipping.country, notes || null]
    );

    const orderId = insertOrderRes.rows[0].id;

    // Insert order items and deduct stock
    for (const item of orderItems) {
      await client.query('INSERT INTO order_items (order_id,product_id,name,price,quantity,size,total) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [orderId, item.product_id, item.name, item.price, item.quantity, item.size, item.total]);
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
    }

    // Update promo usage
    if (promoRecord) {
      await client.query('UPDATE promo_codes SET uses = uses + 1 WHERE id = $1', [promoRecord.id]);
    }

    // Clear server cart if logged in
    if (req.user) {
      await client.query('DELETE FROM carts WHERE user_id = $1', [req.user.id]);
    }

    await client.query('COMMIT');

    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.status(201).json({ message: 'Order placed successfully', order, orderNumber });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendServerError(res, err, 'Failed to place order');
  } finally {
    client.release();
  }
});

// GET /api/orders (user's own orders)
router.get('/orders', auth, async (req, res) => {
  try {
    const orders = await query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ orders });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch orders');
  }
});

// GET /api/orders/:id (BOLA/IDOR Protected with Ownership Verification)
router.get('/orders/:id', optionalAuth, async (req, res) => {
  try {
    const rawParam = String(req.params.id).trim();
    const isNum = /^\d+$/.test(rawParam);
    const guestEmail = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
    const guestPhone = req.query.phone ? String(req.query.phone).trim() : null;

    let order = null;
    if (isNum) {
      // Direct numeric ID queries require authenticated session (never open to unauthenticated guests)
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required to view orders by numeric ID' });
      }
      order = await queryOne('SELECT * FROM orders WHERE id = $1', [parseInt(rawParam, 10)]);
    } else {
      // Lookup by Order Number (e.g. OCF-XXXX-XXXX)
      order = await queryOne('SELECT * FROM orders WHERE order_number = $1', [rawParam]);
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // 1. Admin can view any order
    if (req.user && req.user.role === 'admin') {
      const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      return res.json({ order, items });
    }

    // 2. Authenticated user who owns this order
    if (req.user && order.user_id && req.user.id === order.user_id) {
      const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      return res.json({ order, items });
    }

    // 3. Guest order verification: requires order_number AND matching guest email or phone
    if (!isNum && (order.guest_email || order.shipping_email || order.shipping_phone)) {
      const orderEmail = (order.guest_email || order.shipping_email || '').toLowerCase();
      const orderPhone = order.shipping_phone || '';

      const emailMatches = guestEmail && orderEmail && guestEmail === orderEmail;
      const phoneMatches = guestPhone && orderPhone && guestPhone === orderPhone;

      if (emailMatches || phoneMatches) {
        const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
        return res.json({ order, items });
      }
    }

    // Ownership verification failed
    return res.status(403).json({ error: 'Access denied. You do not have permission to view this order.' });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch order');
  }
});

// ═══════════════════════════════════════
// PROMO CODE VALIDATION
// ═══════════════════════════════════════

// POST /api/promo/validate (Rate-limited)
router.post('/promo/validate', promoLimiter, async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    const promo = await queryOne('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [code?.toUpperCase()]);
    if (!promo) return res.status(404).json({ valid: false, error: 'Invalid promo code' });
    if (promo.uses >= promo.max_uses) return res.status(400).json({ valid: false, error: 'Promo code has reached its usage limit' });
    if (subtotal < parseFloat(promo.min_order)) return res.status(400).json({ valid: false, error: `Minimum order of Br ${parseFloat(promo.min_order).toLocaleString()} required` });

    const val = parseFloat(promo.value);
    const discount = promo.type === 'percent' ? subtotal * (val / 100) : val;
    res.json({ valid: true, promo, discount, message: `${promo.type === 'percent' ? val + '%' : 'Br ' + val} discount applied!` });
  } catch (err) {
    sendServerError(res, err, 'Failed to validate promo code');
  }
});

// ═══════════════════════════════════════
// REVIEW ROUTES
// ═══════════════════════════════════════

// GET /api/products/:id/reviews
router.get('/products/:id/reviews', async (req, res) => {
  try {
    const reviews = await query('SELECT * FROM reviews WHERE product_id = $1 AND is_approved = true ORDER BY created_at DESC', [req.params.id]);
    const avg = reviews.length ? reviews.reduce((s, r) => s + parseFloat(r.rating), 0) / reviews.length : 0;
    res.json({ reviews, average: Math.round(avg * 10) / 10, count: reviews.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/reviews
router.post('/products/:id/reviews', optionalAuth, async (req, res) => {
  try {
    const { rating, title, comment, guest_name, guest_email, location } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    if (!comment) return res.status(400).json({ error: 'Review comment is required' });

    const product = await queryOne('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    await run('INSERT INTO reviews (product_id,user_id,guest_name,guest_email,rating,title,comment,location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [req.params.id, req.user?.id || null, req.user?.name || guest_name, req.user?.email || guest_email, rating, title, comment, location]);

    // Update product rating
    const stats = await queryOne('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE product_id = $1 AND is_approved = true', [req.params.id]);
    const avgRating = stats.avg ? Math.round(parseFloat(stats.avg) * 10) / 10 : 0;
    const count = stats.cnt ? parseInt(stats.cnt, 10) : 0;
    await run('UPDATE products SET rating = $1, review_count = $2 WHERE id = $3', [avgRating, count, req.params.id]);

    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// CONTACT / NEWSLETTER
// ═══════════════════════════════════════

// POST /api/contact
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });
    await run('INSERT INTO contacts (name,email,phone,subject,message) VALUES ($1,$2,$3,$4,$5)', [name, email, phone || null, subject || null, message]);
    res.json({ message: 'Message sent successfully. We\'ll respond within 24 hours.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/newsletter
router.post('/newsletter', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    const exists = await queryOne('SELECT id FROM newsletter WHERE email = $1', [email]);
    if (exists) return res.status(409).json({ error: 'Email already subscribed' });
    await run('INSERT INTO newsletter (email, name) VALUES ($1,$2)', [email, name || null]);
    res.json({ message: 'Subscribed! Check your email for your 10% welcome discount.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// IMAGE UPLOAD (multer — admin only)
// ═══════════════════════════════════════
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const pathLib = require('path');

// Ensure uploads directory exists (configurable via UPLOADS_DIR for persistent disks)
const UPLOAD_DIR = process.env.UPLOADS_DIR
  ? pathLib.resolve(process.env.UPLOADS_DIR)
  : pathLib.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Allowed MIME types (checked server-side, not from file extension)
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTS  = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Magic-byte signatures for each allowed type
const MAGIC_BYTES = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
];

function detectMimeFromBuffer(buf) {
  for (const sig of MAGIC_BYTES) {
    const slice = [...buf.slice(sig.offset, sig.offset + sig.bytes.length)];
    if (sig.bytes.every((b, i) => slice[i] === b)) return sig.mime;
  }
  return null;
}

// Multer disk storage — randomised filename, no original name kept
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const rand = crypto.randomBytes(16).toString('hex');
    const ext  = ALLOWED_EXTS[file.mimetype] || '.bin';
    cb(null, `${rand}${ext}`);
  }
});

// multer instance — MIME filter + 5 MB size cap
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only JPEG, PNG and WebP images are allowed'), { code: 'INVALID_FILE_TYPE' }));
    }
  }
});

// POST /api/admin/upload
router.post('/admin/upload', auth, adminOnly, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      // multer-specific errors (size, type)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum allowed size is 5 MB.' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(415).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided. Send the file as multipart/form-data with field name "image".' });
    }

    // Secondary magic-byte validation against the bytes already on disk
    try {
      const fd  = fs.openSync(req.file.path, 'r');
      const buf = Buffer.alloc(12);
      fs.readSync(fd, buf, 0, 12, 0);
      fs.closeSync(fd);

      const detected = detectMimeFromBuffer(buf);
      if (!detected) {
        fs.unlinkSync(req.file.path);   // delete suspicious file
        return res.status(415).json({ error: 'File content does not match an allowed image type.' });
      }
    } catch (readErr) {
      // If we cannot verify, remove and reject
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(500).json({ error: 'Could not verify uploaded file.' });
    }

    // Build the public URL — never expose the server filesystem path
    const publicUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      message: 'Image uploaded successfully',
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
});

// ═══════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════

// GET /api/admin/dashboard
router.get('/admin/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const totalOrders = (await queryOne('SELECT COUNT(*) as c FROM orders'))?.c || 0;
    const totalRevenue = (await queryOne("SELECT SUM(total) as s FROM orders WHERE status != 'cancelled'"))?.s || 0;
    const totalProducts = (await queryOne('SELECT COUNT(*) as c FROM products WHERE is_active = true'))?.c || 0;
    const totalUsers = (await queryOne("SELECT COUNT(*) as c FROM users WHERE role = 'customer'"))?.c || 0;
    const totalReviews = (await queryOne('SELECT COUNT(*) as c FROM reviews'))?.c || 0;
    const pendingOrders = (await queryOne("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'"))?.c || 0;
    const lowStockProducts = await query('SELECT id, name, stock, sku FROM products WHERE stock < 5 AND is_active = true');
    const recentOrders = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    const unreadMessages = (await queryOne('SELECT COUNT(*) as c FROM contacts WHERE is_read = false'))?.c || 0;
    const newsletterCount = (await queryOne('SELECT COUNT(*) as c FROM newsletter'))?.c || 0;

    const stats = {
      totalOrders: parseInt(totalOrders, 10),
      totalRevenue: totalRevenue ? parseFloat(totalRevenue) : 0,
      totalProducts: parseInt(totalProducts, 10),
      totalUsers: parseInt(totalUsers, 10),
      totalReviews: parseInt(totalReviews, 10),
      pendingOrders: parseInt(pendingOrders, 10),
      lowStockProducts,
      recentOrders,
      unreadMessages: parseInt(unreadMessages, 10),
      newsletterCount: parseInt(newsletterCount, 10)
    };
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
router.get('/admin/orders', auth, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status) { params.push(status); sql += ` WHERE status = $${params.length}`; }
    sql += ' ORDER BY created_at DESC';
    const all = await query(sql, params);
    const offset = (Number(page) - 1) * Number(limit);
    res.json({ orders: all.slice(offset, offset + Number(limit)), total: all.length });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch admin orders');
  }
});

// PUT /api/admin/orders/:id
router.put('/admin/orders/:id', auth, adminOnly, async (req, res) => {
  try {
    const { status, tracking_number } = req.body;
    await run('UPDATE orders SET status=$1,tracking_number=$2,updated_at=NOW() WHERE id=$3', [status, tracking_number, req.params.id]);
    res.json({ message: 'Order updated' });
  } catch (err) {
    sendServerError(res, err, 'Failed to update order');
  }
});

// GET /api/admin/products
router.get('/admin/products', auth, adminOnly, async (req, res) => {
  try {
    const products = (await query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC')).map(formatProduct);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/products
router.post('/admin/products', auth, adminOnly, async (req, res) => {
  try {
    const { name, slug, description, short_desc, price, compare_price, cost_price, stock, region, category_id, sku, material, care, sizes, images, is_best_seller, is_featured, badge, badge_text } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price required' });

    const result = await run(
      `INSERT INTO products (name,slug,description,short_desc,price,compare_price,cost_price,stock,region,category_id,sku,material,care,sizes,images,is_best_seller,is_featured,badge,badge_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        name,
        slug || name.toLowerCase().replace(/\s+/g, '-'),
        n(description),
        n(short_desc),
        price,
        n(compare_price) || null,
        n(cost_price) || null,
        stock || 0,
        n(region) || '',
        n(category_id) || 1,
        n(sku) || null,
        n(material) || null,
        n(care) || null,
        JSON.stringify(sizes || ["S", "M", "L", "XL"]),
        JSON.stringify(images || []),
        is_best_seller ? true : false,
        is_featured ? true : false,
        n(badge) || null,
        n(badge_text) || null
      ]
    );
    res.status(201).json({ message: 'Product created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/products/:id
router.put('/admin/products/:id', auth, adminOnly, async (req, res) => {
  try {
    const p = req.body;
    await run(`UPDATE products SET name=$1,description=$2,short_desc=$3,price=$4,compare_price=$5,stock=$6,region=$7,material=$8,care=$9,is_best_seller=$10,is_featured=$11,is_active=$12,updated_at=NOW() WHERE id=$13`,
      [p.name, n(p.description), n(p.short_desc), p.price, n(p.compare_price) || null, p.stock || 0, n(p.region) || '', n(p.material) || null, n(p.care) || null, p.is_best_seller ? true : false, p.is_featured ? true : false, p.is_active !== false, req.params.id]);
    res.json({ message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/products/:id
router.delete('/admin/products/:id', auth, adminOnly, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!/^\d+$/.test(String(rawId).trim())) {
      return res.status(400).json({ error: 'Invalid product ID. Must be a positive integer.' });
    }
    const productId = parseInt(rawId, 10);
    if (productId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID. Must be a positive integer.' });
    }

    const product = await queryOne('SELECT id, name, images FROM products WHERE id = $1', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Safely delete product from database
    // PostgreSQL constraints:
    // - order_items has ON DELETE SET NULL, preserving all historical order lines and totals
    // - reviews, wishlists, carts have ON DELETE CASCADE
    await run('DELETE FROM products WHERE id = $1', [productId]);

    // Cleanup orphan uploaded images if applicable (only if not used by any other record)
    const images = parseJSON(product.images, []);
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (typeof img === 'string' && img.startsWith('/uploads/')) {
          const filename = pathLib.basename(img);
          // Only process safe upload filename formats (32-hex characters + extension)
          if (/^[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/i.test(filename)) {
            // Check if any other product uses this image
            const otherProd = await queryOne('SELECT id FROM products WHERE images::text LIKE $1 LIMIT 1', [`%${filename}%`]);
            if (!otherProd) {
              const otherCat = await queryOne('SELECT id FROM categories WHERE image LIKE $1 LIMIT 1', [`%${filename}%`]);
              const otherUser = await queryOne('SELECT id FROM users WHERE avatar LIKE $1 LIMIT 1', [`%${filename}%`]);
              const otherRev = await queryOne('SELECT id FROM reviews WHERE images::text LIKE $1 LIMIT 1', [`%${filename}%`]);
              if (!otherCat && !otherUser && !otherRev) {
                const filePath = pathLib.join(UPLOAD_DIR, filename);
                // Ensure target file is strictly inside UPLOAD_DIR
                if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) {
                  try {
                    fs.unlinkSync(filePath);
                  } catch {
                    // Fail silently to avoid exposing filesystem internals
                  }
                }
              }
            }
          }
        }
      }
    }

    res.json({ message: 'Product deleted successfully', id: productId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET /api/admin/messages
router.get('/admin/messages', auth, adminOnly, async (req, res) => {
  try {
    const messages = await query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await query('SELECT id,name,email,role,phone,country,created_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ products: [], bundles: [] });
    const qPattern = `%${q}%`;
    const products = (await query(
      `SELECT id,name,slug,price,compare_price,images,rating,region,badge_text FROM products 
       WHERE is_active = true AND (name ILIKE $1 OR description ILIKE $2 OR region ILIKE $3) LIMIT 8`,
      [qPattern, qPattern, qPattern]
    )).map(formatProduct);

    const bundles = (await query(
      `SELECT id,name,slug,price,icon FROM bundles WHERE is_active = true AND name ILIKE $1 LIMIT 4`,
      [qPattern]
    )).map(formatBundle);

    res.json({ products, bundles, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OCF API (PostgreSQL)', version: '2.0.0', timestamp: new Date().toISOString() });
});

module.exports = router;
