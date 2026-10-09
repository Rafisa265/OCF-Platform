// routes/index.js — All OCF API Routes (PostgreSQL Async)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool, query, queryOne, run } = require('../database/db');
const { auth, adminOnly, optionalAuth } = require('../middleware/auth');
const { normalizeOptionalText, parseProductPrice } = require('../input-validation');

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

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many form submissions. Please try again later.' }
});

// ── Sanitized Server Error Response Helper ────────
const sendServerError = (res, err, customMsg = 'An unexpected server error occurred') => {
  const code = typeof err?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(err.code)
    ? ` (code ${err.code})`
    : '';
  console.error(`${customMsg}${code}`);
  return res.status(500).json({ error: customMsg });
};

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
const n = v => (v === undefined ? null : v);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
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
    name_en: p.name_en || p.name,
    name_om: p.name_om || null,
    description_en: p.description_en ?? p.description ?? null,
    description_om: p.description_om ?? null,
    category_name_en: p.category_name_en || p.category_name || null,
    category_name_om: p.category_name_om || null,
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

const formatCategory = (category) => {
  if (!category) return null;
  return {
    ...category,
    name_en: category.name_en || category.name,
    name_om: category.name_om || null,
    description_en: category.description_en ?? category.description ?? null,
    description_om: category.description_om ?? null
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
    const { name, email, password, phone, country } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length > 255 || normalizedEmail.length > 255 ||
        (phone != null && (typeof phone !== 'string' || phone.length > 50)) ||
        (country != null && (typeof country !== 'string' || country.length > 100))) {
      return res.status(400).json({ error: 'One or more registration fields are too long or invalid' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Password must be 72 bytes or fewer' });

    const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users (name,email,password,phone,country) VALUES ($1,$2,$3,$4,$5)', [name.trim(), normalizedEmail, hash, phone || null, country || 'Ethiopia']);
    const user = await queryOne('SELECT id, name, email, role, phone, country FROM users WHERE email = $1', [normalizedEmail]);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ message: 'Account created successfully', token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    sendServerError(res, err, 'Failed to register account');
  }
});

// POST /api/auth/login
router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await queryOne('SELECT * FROM users WHERE LOWER(email) = $1', [email.trim().toLowerCase()]);
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
    sendServerError(res, err);
  }
});

// PUT /api/auth/profile
router.put('/auth/profile', auth, async (req, res) => {
  try {
    const fields = req.body || {};
    const updates = [];
    const params = [];
    for (const field of ['name', 'phone', 'address', 'city', 'country']) {
      if (fields[field] === undefined) continue;
      if (fields[field] !== null && typeof fields[field] !== 'string') {
        return res.status(400).json({ error: `${field} must be text` });
      }
      if (field === 'name' && !fields[field]?.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const value = field === 'name' && fields[field] !== null ? fields[field].trim() : fields[field];
      const maxLengths = { name: 255, phone: 50, address: 1000, city: 100, country: 100 };
      if (value != null && value.length > maxLengths[field]) {
        return res.status(400).json({ error: `${field} must be ${maxLengths[field]} characters or fewer` });
      }
      params.push(value);
      updates.push(`${field} = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'No profile fields provided' });
    params.push(req.user.id);
    await run(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    sendServerError(res, err, 'Failed to update profile');
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
    sendServerError(res, err);
  }
});

// ═══════════════════════════════════════
// CATEGORY ROUTES
// ═══════════════════════════════════════

// GET /api/categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await query('SELECT * FROM categories WHERE is_active = true ORDER BY id');
    res.json({ categories: cats.map(formatCategory) });
  } catch (err) {
    sendServerError(res, err);
  }
});

// GET /api/categories/:slug
router.get('/categories/:slug', async (req, res) => {
  try {
    const cat = await queryOne('SELECT * FROM categories WHERE slug = $1', [req.params.slug]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const products = (await query('SELECT * FROM products WHERE category_id = $1 AND is_active = true', [cat.id])).map(formatProduct);
    res.json({ category: formatCategory(cat), products });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ═══════════════════════════════════════
// PRODUCT ROUTES
// ═══════════════════════════════════════

// GET /api/products
router.get('/products', async (req, res) => {
  try {
    const { category, region, minPrice, maxPrice, sort, search, featured, bestSeller, page = 1, limit = 12 } = req.query;
    let sql = 'SELECT p.*, c.name as category_name, c.name_en as category_name_en, c.name_om as category_name_om FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = true';
    const params = [];

    if (category) { params.push(category); sql += ` AND c.slug = $${params.length}`; }
    if (region) { params.push(region); sql += ` AND p.region = $${params.length}`; }
    if (minPrice) { params.push(Number(minPrice)); sql += ` AND p.price >= $${params.length}`; }
    if (maxPrice) { params.push(Number(maxPrice)); sql += ` AND p.price <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      sql += ` AND (p.name ILIKE $${params.length - 2} OR p.name_en ILIKE $${params.length - 2} OR p.name_om ILIKE $${params.length - 2} OR p.description ILIKE $${params.length - 1} OR p.description_en ILIKE $${params.length - 1} OR p.description_om ILIKE $${params.length - 1} OR p.region ILIKE $${params.length})`;
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
    sendServerError(res, err);
  }
});

// GET /api/products/best-sellers
router.get('/products/best-sellers', async (req, res) => {
  try {
    const products = (await query('SELECT * FROM products WHERE is_best_seller = true AND is_active = true ORDER BY review_count DESC LIMIT 8')).map(formatProduct);
    res.json({ products });
  } catch (err) {
    sendServerError(res, err);
  }
});

// GET /api/products/:slug
router.get('/products/:slug', optionalAuth, async (req, res) => {
  try {
    const product = await queryOne('SELECT p.*, c.name as category_name, c.name_en as category_name_en, c.name_om as category_name_om FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1 AND p.is_active = true', [req.params.slug]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const reviews = await query('SELECT * FROM reviews WHERE product_id = $1 AND is_approved = true ORDER BY created_at DESC', [product.id]);
    const related = (await query('SELECT * FROM products WHERE category_id = $1 AND id != $2 AND is_active = true LIMIT 4', [product.category_id, product.id])).map(formatProduct);
    const wishlisted = req.user ? !!(await queryOne('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, product.id])) : false;
    res.json({ product: formatProduct(product), reviews, related, wishlisted });
  } catch (err) {
    sendServerError(res, err);
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
    sendServerError(res, err);
  }
});

// GET /api/bundles/:slug
router.get('/bundles/:slug', async (req, res) => {
  try {
    const bundle = await queryOne('SELECT * FROM bundles WHERE slug = $1 AND is_active = true', [req.params.slug]);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });
    res.json({ bundle: formatBundle(bundle) });
  } catch (err) {
    sendServerError(res, err);
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
    sendServerError(res, err);
  }
});

// POST /api/cart
router.post('/cart', auth, async (req, res) => {
  try {
    const { product_id, quantity = 1, size = 'M' } = req.body || {};
    const productId = Number(product_id);
    const requestedQuantity = Number(quantity);
    const normalizedSize = typeof size === 'string' ? size.trim() : '';
    if (!Number.isSafeInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'A valid product ID is required' });
    }
    if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }
    if (!normalizedSize || normalizedSize.length > 50) {
      return res.status(400).json({ error: 'A valid size is required' });
    }

    const product = await queryOne('SELECT id, stock FROM products WHERE id = $1 AND is_active = true', [productId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const existing = await queryOne('SELECT * FROM carts WHERE user_id = $1 AND product_id = $2 AND size = $3', [req.user.id, productId, normalizedSize]);
    const totalQuantity = requestedQuantity + (existing?.quantity || 0);
    if (totalQuantity > product.stock) {
      return res.status(400).json({ error: `Only ${product.stock} item(s) are currently in stock` });
    }
    if (existing) {
      await run('UPDATE carts SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [requestedQuantity, existing.id]);
    } else {
      await run('INSERT INTO carts (user_id, product_id, quantity, size) VALUES ($1,$2,$3,$4)', [req.user.id, productId, requestedQuantity, normalizedSize]);
    }
    res.json({ message: 'Item added to cart' });
  } catch (err) {
    sendServerError(res, err);
  }
});

// PUT /api/cart/:id
router.put('/cart/:id', auth, async (req, res) => {
  try {
    const quantity = Number(req.body?.quantity);
    const cartId = Number(req.params.id);
    if (!Number.isSafeInteger(cartId) || cartId < 1) {
      return res.status(400).json({ error: 'A valid cart item ID is required' });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a non-negative integer' });
    }
    const item = await queryOne(
      'SELECT c.id, p.stock FROM carts c JOIN products p ON p.id = c.product_id WHERE c.id = $1 AND c.user_id = $2',
      [cartId, req.user.id]
    );
    if (!item) return res.status(404).json({ error: 'Cart item not found' });
    if (quantity === 0) {
      await run('DELETE FROM carts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return res.json({ message: 'Item removed' });
    }
    if (quantity > item.stock) {
      return res.status(400).json({ error: `Only ${item.stock} item(s) are currently in stock` });
    }
    await run('UPDATE carts SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [quantity, cartId, req.user.id]);
    res.json({ message: 'Cart updated' });
  } catch (err) {
    sendServerError(res, err);
  }
});

// DELETE /api/cart/:id
router.delete('/cart/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM carts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Item removed from cart' });
  } catch (err) {
    sendServerError(res, err);
  }
});

// DELETE /api/cart
router.delete('/cart', auth, async (req, res) => {
  try {
    await run('DELETE FROM carts WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    sendServerError(res, err);
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
    sendServerError(res, err);
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
    sendServerError(res, err);
  }
});

// ═══════════════════════════════════════
// ORDER ROUTES
// ═══════════════════════════════════════

// POST /api/orders (Transactional & Rate-limited)
router.post('/orders', orderLimiter, optionalAuth, async (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
  }

  const client = await pool.connect();
  try {
    const { items, shipping, payment_method, promo_code, notes } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Order must have at least one item' });
    if (!shipping || typeof shipping !== 'object' || Array.isArray(shipping) || typeof shipping.name !== 'string' ||
        !shipping.name.trim() || typeof shipping.email !== 'string' ||
        typeof shipping.phone !== 'string' || !shipping.phone.trim() ||
        typeof shipping.address !== 'string' || !shipping.address.trim() ||
        typeof shipping.city !== 'string' || !shipping.city.trim()) {
      return res.status(400).json({ error: 'Shipping information required' });
    }
    const shippingLimits = { name: 255, email: 255, phone: 50, address: 1000, city: 100, state: 100, zip: 50, country: 100 };
    for (const [field, limit] of Object.entries(shippingLimits)) {
      const value = shipping[field];
      if (value != null && (typeof value !== 'string' || value.length > limit)) {
        return res.status(400).json({ error: `Shipping ${field} must be valid text of ${limit} characters or fewer` });
      }
    }
    if (promo_code != null && (typeof promo_code !== 'string' || !promo_code.trim() || promo_code.length > 50)) {
      return res.status(400).json({ error: 'Promo code must be valid text' });
    }
    if (payment_method != null && (typeof payment_method !== 'string' || payment_method.length > 50)) {
      return res.status(400).json({ error: 'Payment method must be valid text' });
    }
    if (notes != null && (typeof notes !== 'string' || notes.length > 2000)) {
      return res.status(400).json({ error: 'Order notes must be text of 2000 characters or fewer' });
    }

    const normalizedShipping = {
      name: shipping.name.trim(),
      email: shipping.email.trim().toLowerCase(),
      phone: shipping.phone.trim(),
      address: shipping.address.trim(),
      city: shipping.city.trim(),
      state: typeof shipping.state === 'string' && shipping.state.trim() ? shipping.state.trim() : null,
      zip: typeof shipping.zip === 'string' && shipping.zip.trim() ? shipping.zip.trim() : null,
      country: typeof shipping.country === 'string' && shipping.country.trim()
        ? shipping.country.trim()
        : 'Ethiopia'
    };
    const normalizedPaymentMethod = typeof payment_method === 'string' && payment_method.trim()
      ? payment_method.trim()
      : 'pending';
    const normalizedPromoCode = typeof promo_code === 'string' && promo_code.trim()
      ? promo_code.trim().toUpperCase()
      : null;
    const normalizedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedShipping.email)) {
      return res.status(400).json({ error: 'Valid shipping email required' });
    }

    const normalizedItems = [];
    const demandByProduct = new Map();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'Each order item must be an object' });
      }
      const productId = Number(item?.product_id);
      const qty = Number(item?.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ error: 'Each item must have a valid product ID' });
      }
      if (!Number.isSafeInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Item quantity must be a positive integer' });
      }
      const size = item.size === undefined ? 'M' : item.size;
      if (typeof size !== 'string' || !size.trim() || size.length > 50) {
        return res.status(400).json({ error: 'Item size must be valid text' });
      }
      normalizedItems.push({ productId, quantity: qty, size: size.trim() });
      demandByProduct.set(productId, (demandByProduct.get(productId) || 0) + qty);
    }

    const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({
      userId: req.user?.id || null,
      items: normalizedItems,
      shipping: [
        normalizedShipping.name,
        normalizedShipping.email,
        normalizedShipping.phone,
        normalizedShipping.address,
        normalizedShipping.city,
        normalizedShipping.state,
        normalizedShipping.zip,
        normalizedShipping.country
      ],
      paymentMethod: normalizedPaymentMethod,
      promoCode: normalizedPromoCode,
      notes: normalizedNotes
    })).digest('hex');

    await client.query('BEGIN');

    // The unique key claim serializes concurrent requests before inventory is locked or changed.
    const claim = await client.query(
      `INSERT INTO checkout_idempotency (idempotency_key, request_fingerprint)
       VALUES ($1, $2)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, requestFingerprint]
    );
    if (!claim.rowCount) {
      const existing = await client.query(
        `SELECT ci.request_fingerprint, ci.order_id, o.order_number
         FROM checkout_idempotency ci
         LEFT JOIN orders o ON o.id = ci.order_id
         WHERE ci.idempotency_key = $1`,
        [idempotencyKey]
      );
      await client.query('ROLLBACK');
      const previous = existing.rows[0];
      if (previous?.request_fingerprint === requestFingerprint && previous.order_id) {
        const order = await queryOne('SELECT * FROM orders WHERE id = $1', [previous.order_id]);
        if (order) {
          return res.status(200).json({
            message: 'Order was already processed',
            order,
            orderNumber: previous.order_number,
            replayed: true
          });
        }
      }
      return res.status(409).json({
        error: 'Idempotency key has already been used for a different or incomplete checkout'
      });
    }

    // Lock products in a stable order and check combined demand, including repeated cart lines.
    const products = new Map();
    for (const productId of [...demandByProduct.keys()].sort((a, b) => a - b)) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
      const product = prodRes.rows[0];
      if (!product || !product.is_active) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Product ${productId} not found or unavailable` });
      }
      if (product.stock < demandByProduct.get(productId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product "${product.name}" has insufficient stock (${product.stock} available)` });
      }
      products.set(productId, product);
    }

    let subtotal = 0;
    const orderItems = [];
    for (const item of normalizedItems) {
      const product = products.get(item.productId);
      const qty = item.quantity;
      const linePrice = parseFloat(product.price);
      const lineTotal = linePrice * qty;
      subtotal += lineTotal;
      orderItems.push({
        product_id: product.id,
        name: product.name,
        price: linePrice,
        quantity: qty,
        size: item.size,
        total: lineTotal
      });
    }

    // Validate promo against subtotal
    let discount = 0;
    let promoRecord = null;
    if (normalizedPromoCode) {
      const pRes = await client.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE', [normalizedPromoCode]);
      promoRecord = pRes.rows[0];
      if (!promoRecord || (promoRecord.expires_at && new Date(promoRecord.expires_at) <= new Date())) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Promo code is invalid or expired' });
      }
      if (promoRecord.uses >= promoRecord.max_uses) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Promo code has reached its usage limit' });
      }
      if (subtotal < parseFloat(promoRecord.min_order)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Minimum order of Br ${parseFloat(promoRecord.min_order).toLocaleString()} required` });
      }
      const promoValue = parseFloat(promoRecord.value);
      discount = Math.min(subtotal, promoRecord.type === 'percent' ? subtotal * (promoValue / 100) : promoValue);
    }

    const shippingCost = subtotal >= 15000 ? 0 : (normalizedShipping.country === 'Ethiopia' ? 800 : 2500);
    const total = subtotal - discount + shippingCost;
    const orderNumber = generateOrderNumber();

    const insertOrderRes = await client.query(`INSERT INTO orders 
      (order_number,user_id,guest_email,subtotal,shipping_cost,discount,total,payment_method,
       shipping_name,shipping_email,shipping_phone,shipping_address,shipping_city,shipping_state,shipping_zip,shipping_country,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [orderNumber, req.user?.id || null, shipping.email.trim().toLowerCase(), subtotal, shippingCost, discount, total,
       normalizedPaymentMethod, normalizedShipping.name, normalizedShipping.email, normalizedShipping.phone,
       normalizedShipping.address, normalizedShipping.city, normalizedShipping.state, normalizedShipping.zip,
       normalizedShipping.country, normalizedNotes]
    );

    const orderId = insertOrderRes.rows[0].id;
    await client.query(
      'UPDATE checkout_idempotency SET order_id = $1 WHERE idempotency_key = $2',
      [orderId, idempotencyKey]
    );

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
    const { code, subtotal } = req.body || {};
    const orderSubtotal = Number(subtotal);
    if (typeof code !== 'string' || !code.trim() || !Number.isFinite(orderSubtotal) || orderSubtotal < 0) {
      return res.status(400).json({ valid: false, error: 'A promo code and valid subtotal are required' });
    }
    const promo = await queryOne('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [code.trim().toUpperCase()]);
    if (!promo) return res.status(404).json({ valid: false, error: 'Invalid promo code' });
    if (promo.expires_at && new Date(promo.expires_at) <= new Date()) {
      return res.status(400).json({ valid: false, error: 'Promo code has expired' });
    }
    if (promo.uses >= promo.max_uses) return res.status(400).json({ valid: false, error: 'Promo code has reached its usage limit' });
    if (orderSubtotal < parseFloat(promo.min_order)) return res.status(400).json({ valid: false, error: `Minimum order of Br ${parseFloat(promo.min_order).toLocaleString()} required` });

    const val = parseFloat(promo.value);
    const discount = Math.min(orderSubtotal, promo.type === 'percent' ? orderSubtotal * (val / 100) : val);
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
    sendServerError(res, err);
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
    sendServerError(res, err);
  }
});

// ═══════════════════════════════════════
// CONTACT / NEWSLETTER
// ═══════════════════════════════════════

// POST /api/contact
router.post('/contact', publicFormLimiter, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A name, valid email and message are required' });
    }
    if (name.trim().length > 255 || email.trim().length > 255 ||
        (phone != null && (typeof phone !== 'string' || phone.length > 50)) ||
        (subject != null && (typeof subject !== 'string' || subject.length > 255))) {
      return res.status(400).json({ error: 'One or more contact fields are too long or invalid' });
    }
    await run('INSERT INTO contacts (name,email,phone,subject,message) VALUES ($1,$2,$3,$4,$5)',
      [name.trim(), email.trim().toLowerCase(), phone?.trim() || null, subject?.trim() || null, message.trim()]);
    res.json({ message: 'Message sent successfully. We\'ll respond within 24 hours.' });
  } catch (err) {
    sendServerError(res, err, 'Failed to send message');
  }
});

// POST /api/newsletter
router.post('/newsletter', publicFormLimiter, async (req, res) => {
  try {
    const { email, name } = req.body || {};
    if (typeof email !== 'string' || email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (name != null && (typeof name !== 'string' || name.length > 255)) {
      return res.status(400).json({ error: 'Name must be 255 characters or fewer' });
    }
    const exists = await queryOne('SELECT id FROM newsletter WHERE LOWER(email) = $1', [normalizedEmail]);
    if (exists) return res.status(409).json({ error: 'Email already subscribed' });
    await run('INSERT INTO newsletter (email, name) VALUES ($1,$2)', [normalizedEmail, name?.trim() || null]);
    res.json({ message: 'Successfully subscribed to the newsletter.' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already subscribed' });
    sendServerError(res, err, 'Failed to subscribe');
  }
});

// ═══════════════════════════════════════
// IMAGE UPLOAD (multer — admin only)
// ═══════════════════════════════════════
const multer = require('multer');
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
        return res.status(415).json({ error: 'Only JPEG, PNG and WebP images are allowed' });
      }
      return res.status(400).json({ error: 'Upload failed' });
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
    sendServerError(res, err);
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
    const products = (await query('SELECT p.*, c.name as category_name, c.name_en as category_name_en, c.name_om as category_name_om FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC')).map(formatProduct);
    res.json({ products });
  } catch (err) {
    sendServerError(res, err);
  }
});

// POST /api/admin/products
router.post('/admin/products', auth, adminOnly, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Product fields are required' });
    }
    const { name, name_en, name_om, slug, description, description_en, description_om, short_desc, price, compare_price, cost_price, stock, region, category_id, sku, material, care, sizes, images, is_best_seller, is_featured, badge, badge_text } = body;
    const englishName = name_en ?? name;
    const oromoName = typeof name_om === 'string' && name_om.trim() ? name_om.trim() : null;
    const englishDescription = description_en ?? description ?? null;
    const oromoDescription = typeof description_om === 'string' && description_om.trim() ? description_om.trim() : null;
    const productPrice = parseProductPrice(price);
    if (typeof englishName !== 'string' || !englishName.trim()) {
      return res.status(400).json({ error: 'An English product name is required' });
    }
    if ((name_om != null && typeof name_om !== 'string') ||
        (description_om != null && typeof description_om !== 'string') ||
        englishName.trim().length > 255 || (oromoName && oromoName.length > 255) ||
        (englishDescription != null && typeof englishDescription !== 'string') ||
        (oromoDescription != null && typeof oromoDescription !== 'string')) {
      return res.status(400).json({ error: 'Product translations are invalid or too long' });
    }
    if (productPrice === null) {
      return res.status(400).json({ error: 'A valid product price is required' });
    }

    const result = await run(
      `INSERT INTO products (name,name_en,name_om,slug,description,description_en,description_om,short_desc,price,compare_price,cost_price,stock,region,category_id,sku,material,care,sizes,images,is_best_seller,is_featured,badge,badge_text)
       VALUES ($1,$1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [
        englishName.trim(),
        oromoName,
        slug || englishName.trim().toLowerCase().replace(/\s+/g, '-'),
        n(englishDescription),
        n(oromoDescription),
        n(short_desc),
        productPrice,
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
    sendServerError(res, err);
  }
});

// PUT /api/admin/products/:id
router.put('/admin/products/:id', auth, adminOnly, async (req, res) => {
  try {
    const p = req.body;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return res.status(400).json({ error: 'Product fields are required' });
    }
    const rawId = String(req.params.id).trim();
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const productId = Number(rawId);
    const existing = await queryOne('SELECT * FROM products WHERE id = $1', [productId]);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const englishNameValue = hasOwn(p, 'name_en')
      ? p.name_en
      : hasOwn(p, 'name')
        ? p.name
        : (existing.name_en ?? existing.name);
    const englishName = typeof englishNameValue === 'string' ? englishNameValue.trim() : '';
    if (!englishName || englishName.length > 255) {
      return res.status(400).json({ error: 'An English product name is required (maximum 255 characters)' });
    }

    const oromoName = hasOwn(p, 'name_om')
      ? normalizeOptionalText(p.name_om)
      : existing.name_om;
    const englishDescriptionValue = hasOwn(p, 'description_en')
      ? p.description_en
      : hasOwn(p, 'description')
        ? p.description
        : (existing.description_en ?? existing.description);
    const oromoDescriptionValue = hasOwn(p, 'description_om') ? p.description_om : existing.description_om;
    const translations = [englishDescriptionValue, oromoDescriptionValue];
    if (oromoName === undefined ||
        (oromoName != null && oromoName.length > 255) ||
        translations.some(value => value != null &&
          (typeof value !== 'string' || value.length > 10000))) {
      return res.status(400).json({ error: 'Product translations are invalid or too long' });
    }
    if (hasOwn(p, 'short_desc') &&
        p.short_desc != null &&
        (typeof p.short_desc !== 'string' || p.short_desc.length > 1000)) {
      return res.status(400).json({ error: 'Short description must be text of 1000 characters or fewer' });
    }

    const productPrice = parseProductPrice(hasOwn(p, 'price') ? p.price : existing.price);
    if (productPrice === null) {
      return res.status(400).json({ error: 'A valid non-negative product price is required' });
    }
    const stockValue = hasOwn(p, 'stock') ? p.stock : existing.stock;
    const stockText = typeof stockValue === 'string' ? stockValue.trim() : stockValue;
    if ((typeof stockText !== 'number' && typeof stockText !== 'string') ||
        (typeof stockText === 'string' && !/^(0|[1-9]\d*)$/.test(stockText)) ||
        !Number.isSafeInteger(Number(stockText)) || Number(stockText) < 0 ||
        Number(stockText) > 2147483647) {
      return res.status(400).json({ error: 'Stock must be a non-negative integer' });
    }

    const result = await run(`UPDATE products SET name=$1,name_en=$1,name_om=$2,description=$3,description_en=$3,description_om=$4,short_desc=$5,price=$6,compare_price=$7,stock=$8,region=$9,material=$10,care=$11,is_best_seller=$12,is_featured=$13,is_active=$14,updated_at=NOW() WHERE id=$15 RETURNING id`,
      [englishName, oromoName, n(englishDescriptionValue), n(oromoDescriptionValue), n(p.short_desc), productPrice, n(p.compare_price) || null, Number(stockText), n(p.region) || '', n(p.material) || null, n(p.care) || null, p.is_best_seller ? true : false, p.is_featured ? true : false, p.is_active !== false, productId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product updated' });
  } catch (err) {
    sendServerError(res, err, 'Failed to update product');
  }
});

// Admin category management
router.get('/admin/categories', auth, adminOnly, async (req, res) => {
  try {
    const categories = (await query('SELECT * FROM categories ORDER BY id')).map(formatCategory);
    res.json({ categories });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch categories');
  }
});

router.post('/admin/categories', auth, adminOnly, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Category fields are required' });
    }
    const englishNameValue = body.name_en ?? body.name;
    const englishName = typeof englishNameValue === 'string' ? englishNameValue.trim() : '';
    const oromoName = normalizeOptionalText(body.name_om);
    const englishDescription = body.description_en ?? body.description ?? null;
    const oromoDescription = normalizeOptionalText(body.description_om);
    if (!englishName || englishName.length > 255 ||
        oromoName === undefined || (oromoName && oromoName.length > 255) ||
        (englishDescription != null &&
          (typeof englishDescription !== 'string' || englishDescription.length > 10000)) ||
        oromoDescription === undefined ||
        (oromoDescription != null && oromoDescription.length > 10000) ||
        (body.region != null && (typeof body.region !== 'string' || body.region.length > 100)) ||
        (body.image != null && (typeof body.image !== 'string' || body.image.length > 2048))) {
      return res.status(400).json({ error: 'An English category name is required (maximum 255 characters)' });
    }
    const categorySlug = hasOwn(body, 'slug')
      ? (typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '')
      : englishName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!categorySlug || categorySlug.length > 255 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) {
      return res.status(400).json({ error: 'Category slug must contain only letters, numbers, and single hyphen separators' });
    }
    const duplicateName = await queryOne(
      'SELECT id FROM categories WHERE LOWER(name_en) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1',
      [englishName]
    );
    if (duplicateName) return res.status(409).json({ error: 'A category with this name already exists' });
    const result = await run(
      'INSERT INTO categories (name,name_en,name_om,slug,description,description_en,description_om,image,region) VALUES ($1,$1,$2,$3,$4,$4,$5,$6,$7) RETURNING id',
      [englishName, oromoName, categorySlug, englishDescription, oromoDescription, n(body.image), n(body.region)]
    );
    res.status(201).json({ message: 'Category created', id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with this name or slug already exists' });
    sendServerError(res, err, 'Failed to create category');
  }
});

router.put('/admin/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Category fields are required' });
    }
    const rawId = String(req.params.id).trim();
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }
    const categoryId = Number(rawId);
    const existing = await queryOne('SELECT id, slug FROM categories WHERE id = $1', [categoryId]);
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const englishNameValue = body.name_en ?? body.name;
    const englishName = typeof englishNameValue === 'string' ? englishNameValue.trim() : '';
    const oromoName = normalizeOptionalText(body.name_om);
    const englishDescription = body.description_en ?? body.description ?? null;
    const oromoDescription = normalizeOptionalText(body.description_om);
    if (!englishName || englishName.length > 255 ||
        oromoName === undefined || (oromoName && oromoName.length > 255) ||
        (englishDescription != null &&
          (typeof englishDescription !== 'string' || englishDescription.length > 10000)) ||
        oromoDescription === undefined ||
        (oromoDescription != null && oromoDescription.length > 10000) ||
        (body.region != null && (typeof body.region !== 'string' || body.region.length > 100)) ||
        (body.image != null && (typeof body.image !== 'string' || body.image.length > 2048)) ||
        (hasOwn(body, 'is_active') && typeof body.is_active !== 'boolean')) {
      return res.status(400).json({ error: 'An English category name is required (maximum 255 characters)' });
    }
    const categorySlug = hasOwn(body, 'slug')
      ? (typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '')
      : existing.slug;
    if (!categorySlug || categorySlug.length > 255 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) {
      return res.status(400).json({ error: 'Category slug must contain only letters, numbers, and single hyphen separators' });
    }
    const duplicateName = await queryOne(
      'SELECT id FROM categories WHERE (LOWER(name_en) = LOWER($1) OR LOWER(name) = LOWER($1)) AND id <> $2 LIMIT 1',
      [englishName, categoryId]
    );
    if (duplicateName) return res.status(409).json({ error: 'A category with this name already exists' });
    const result = await run(
      `UPDATE categories SET name=$1,name_en=$1,name_om=CASE WHEN $10 THEN $2 ELSE name_om END,slug=$3,description=$4,description_en=$4,description_om=CASE WHEN $11 THEN $5 ELSE description_om END,image=$6,region=$7,is_active=$8
       WHERE id=$9`,
      [englishName, oromoName, categorySlug, englishDescription, oromoDescription, n(body.image), n(body.region),
        body.is_active !== false, categoryId, hasOwn(body, 'name_om'), hasOwn(body, 'description_om')]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category updated' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with this name or slug already exists' });
    sendServerError(res, err, 'Failed to update category');
  }
});

router.delete('/admin/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    const rawId = String(req.params.id).trim();
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }
    const result = await run('DELETE FROM categories WHERE id=$1', [Number(rawId)]);
    if (!result.rowCount) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    sendServerError(res, err, 'Failed to delete category');
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
    sendServerError(res, err);
  }
});

// GET /api/admin/users
router.get('/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await query('SELECT id,name,email,role,phone,country,created_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) {
    sendServerError(res, err);
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
    sendServerError(res, err);
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OCF API (PostgreSQL)', version: '2.0.0', timestamp: new Date().toISOString() });
});

module.exports = router;
