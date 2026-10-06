-- 001_initial_schema.sql — OCF Initial Schema Foundation

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'customer' CHECK(role IN ('customer', 'admin', 'artisan')),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Ethiopia',
  avatar TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  image TEXT,
  region VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  short_desc TEXT,
  price DECIMAL(12, 2) NOT NULL CHECK(price >= 0),
  compare_price DECIMAL(12, 2) CHECK(compare_price IS NULL OR compare_price >= 0),
  cost_price DECIMAL(12, 2) CHECK(cost_price IS NULL OR cost_price >= 0),
  images JSONB DEFAULT '[]'::jsonb,
  sizes JSONB DEFAULT '["S","M","L","XL","XXL"]'::jsonb,
  colors JSONB DEFAULT '[]'::jsonb,
  stock INTEGER DEFAULT 0 CHECK(stock >= 0),
  sku VARCHAR(100) UNIQUE,
  region VARCHAR(100),
  gender VARCHAR(20) DEFAULT 'unisex',
  age_group VARCHAR(20) DEFAULT 'adult',
  age_range JSONB DEFAULT '[]'::jsonb,
  material TEXT,
  care TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_best_seller BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  is_new BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  rating DECIMAL(3, 2) DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
  review_count INTEGER DEFAULT 0 CHECK(review_count >= 0),
  badge VARCHAR(50),
  badge_text VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BUNDLES
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  price DECIMAL(12, 2) NOT NULL CHECK(price >= 0),
  compare_price DECIMAL(12, 2) CHECK(compare_price IS NULL OR compare_price >= 0),
  discount_pct DECIMAL(5, 2) DEFAULT 0,
  savings DECIMAL(12, 2) DEFAULT 0,
  items_json JSONB DEFAULT '[]'::jsonb,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_email VARCHAR(255),
  subtotal DECIMAL(12, 2) NOT NULL CHECK(subtotal >= 0),
  shipping_cost DECIMAL(12, 2) DEFAULT 0 CHECK(shipping_cost >= 0),
  tax DECIMAL(12, 2) DEFAULT 0 CHECK(tax >= 0),
  discount DECIMAL(12, 2) DEFAULT 0 CHECK(discount >= 0),
  total DECIMAL(12, 2) NOT NULL CHECK(total >= 0),
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_method VARCHAR(50),
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_id VARCHAR(255),
  shipping_name VARCHAR(255),
  shipping_email VARCHAR(255),
  shipping_phone VARCHAR(50),
  shipping_address TEXT,
  shipping_city VARCHAR(100),
  shipping_state VARCHAR(100),
  shipping_zip VARCHAR(50),
  shipping_country VARCHAR(100),
  tracking_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  bundle_id INTEGER REFERENCES bundles(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(12, 2) NOT NULL CHECK(price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  size VARCHAR(50),
  total DECIMAL(12, 2) NOT NULL CHECK(total >= 0)
);

-- 7. REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title VARCHAR(255),
  comment TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  is_verified BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE,
  location VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. WISHLISTS
CREATE TABLE IF NOT EXISTS wishlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_wishlists_user_product UNIQUE (user_id, product_id)
);

-- 9. CARTS
CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1 CHECK(quantity > 0),
  size VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_carts_user_product_size UNIQUE (user_id, product_id, size)
);

-- 10. CONTACTS
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  replied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. NEWSLETTER
CREATE TABLE IF NOT EXISTS newsletter (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  discount_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PROMO CODES
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) DEFAULT 'percent' CHECK(type IN ('percent', 'fixed')),
  value DECIMAL(12, 2) NOT NULL CHECK(value > 0),
  min_order DECIMAL(12, 2) DEFAULT 0 CHECK(min_order >= 0),
  max_uses INTEGER DEFAULT 100 CHECK(max_uses >= 0),
  uses INTEGER DEFAULT 0 CHECK(uses >= 0),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_region ON products(region);
CREATE INDEX IF NOT EXISTS idx_products_gender_age ON products(gender, age_group);
CREATE INDEX IF NOT EXISTS idx_products_featured_bestseller ON products(is_featured, is_best_seller) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id) WHERE is_approved = TRUE;
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code) WHERE is_active = TRUE;
