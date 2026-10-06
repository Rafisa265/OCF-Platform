// database/init.js — OCF Database Schema + Seed Data
const initSql = `
-- ═══════════════════════════════════════
-- OCF DATABASE SCHEMA
-- ═══════════════════════════════════════

PRAGMA foreign_keys = ON;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT DEFAULT 'customer' CHECK(role IN ('customer','admin','artisan')),
  phone       TEXT,
  address     TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'Ethiopia',
  avatar      TEXT,
  is_verified INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  image       TEXT,
  region      TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  short_desc      TEXT,
  price           REAL NOT NULL,
  compare_price   REAL,
  cost_price      REAL,
  images          TEXT DEFAULT '[]',
  sizes           TEXT DEFAULT '["S","M","L","XL","XXL"]',
  colors          TEXT DEFAULT '[]',
  stock           INTEGER DEFAULT 0,
  sku             TEXT UNIQUE,
  region          TEXT,
  material        TEXT,
  care            TEXT,
  category_id     INTEGER,
  is_best_seller  INTEGER DEFAULT 0,
  is_featured     INTEGER DEFAULT 0,
  is_new          INTEGER DEFAULT 1,
  is_active       INTEGER DEFAULT 1,
  rating          REAL DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  badge           TEXT,
  badge_text      TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- BUNDLES
CREATE TABLE IF NOT EXISTS bundles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  icon        TEXT,
  price       REAL NOT NULL,
  compare_price REAL,
  discount_pct  REAL,
  savings     REAL,
  items_json  TEXT DEFAULT '[]',
  is_featured INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number    TEXT UNIQUE NOT NULL,
  user_id         INTEGER,
  guest_email     TEXT,
  subtotal        REAL NOT NULL,
  shipping_cost   REAL DEFAULT 0,
  tax             REAL DEFAULT 0,
  discount        REAL DEFAULT 0,
  total           REAL NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','shipped','delivered','cancelled','refunded')),
  payment_method  TEXT,
  payment_status  TEXT DEFAULT 'pending',
  payment_id      TEXT,
  shipping_name   TEXT,
  shipping_email  TEXT,
  shipping_phone  TEXT,
  shipping_address TEXT,
  shipping_city   TEXT,
  shipping_state  TEXT,
  shipping_zip    TEXT,
  shipping_country TEXT,
  tracking_number TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL,
  product_id  INTEGER,
  bundle_id   INTEGER,
  name        TEXT NOT NULL,
  price       REAL NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  size        TEXT,
  total       REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  user_id     INTEGER,
  guest_name  TEXT,
  guest_email TEXT,
  rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title       TEXT,
  comment     TEXT,
  images      TEXT DEFAULT '[]',
  is_verified INTEGER DEFAULT 0,
  is_approved INTEGER DEFAULT 1,
  location    TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- WISHLIST
CREATE TABLE IF NOT EXISTS wishlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- CART (server-side for logged-in users)
CREATE TABLE IF NOT EXISTS carts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  quantity    INTEGER DEFAULT 1,
  size        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id, size),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- CONTACTS / MESSAGES
CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  is_read     INTEGER DEFAULT 0,
  replied     INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- NEWSLETTER SUBSCRIBERS
CREATE TABLE IF NOT EXISTS newsletter (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  discount_sent INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- PROMO CODES
CREATE TABLE IF NOT EXISTS promo_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE NOT NULL,
  type        TEXT DEFAULT 'percent' CHECK(type IN ('percent','fixed')),
  value       REAL NOT NULL,
  min_order   REAL DEFAULT 0,
  max_uses    INTEGER DEFAULT 100,
  uses        INTEGER DEFAULT 0,
  expires_at  TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);
`;

// ═══════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════
const seedCategories = [
  { name: "Women's Wear", slug: "womens-wear", description: "Traditional women's dresses, shawls and ceremonial attire", region: "All", image: "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5340932171_b7y9-837992.jpg" },
  { name: "Men's Wear", slug: "mens-wear", description: "Men's ceremonial and everyday traditional clothing", region: "All", image: "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-22.jpg" },
  { name: "Children's Wear", slug: "childrens-wear", description: "Traditional attire for children aged 3-12", region: "All", image: "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-10.jpg" },
  { name: "Accessories", slug: "accessories", description: "Beaded jewelry, shawls and traditional accessories", region: "All", image: "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5093843040_m6o4-362453.jpg" },
  { name: "Wedding Collection", slug: "wedding", description: "Complete wedding attire packages", region: "All", image: "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-24.jpg" }
];

const seedProducts = [
  {
    name: "Women's Heritage Dress",
    slug: "womens-heritage-dress-wallagga",
    description: "Handcrafted by master weavers from western Oromia. This ceremonial dress features intricate geometric embroidery using natural dyes — the signature bold diamond patterns of the Wallagga tradition. Each piece takes up to 14 days to complete.",
    short_desc: "Traditional Wallagga women's dress with geometric embroidery",
    price: 12000, compare_price: 14000, cost_price: 6000, stock: 18,
    region: "Wallagga", category_id: 1, sku: "OCF-W-001",
    material: "100% handwoven cotton with silk embroidery thread",
    care: "Dry clean only. Store in breathable cloth bag. Avoid direct sunlight.",
    sizes: '["XS","S","M","L","XL","XXL"]',
    images: JSON.stringify([
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5340932171_b7y9-837992.jpg",
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5340932687_ipyy-863781.jpg",
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5340931803_hd19-764744.jpg"
    ]),
    is_best_seller: 1, is_featured: 1, is_new: 0, rating: 4.9, review_count: 124,
    badge: "hot", badge_text: "Best Seller"
  },
  {
    name: "Men's Ceremonial Outfit",
    slug: "mens-ceremonial-outfit-shawaa",
    description: "Elegant men's ceremonial outfit from central Oromia. Complete with embroidered cape and matching trousers. The Shawaa tradition features finer embroidery with delicate color gradients, often incorporating silver thread alongside gold. Perfect for weddings and Irreecha.",
    short_desc: "Complete men's ceremonial outfit with embroidered cape",
    price: 14000, compare_price: 16500, cost_price: 7000, stock: 14,
    region: "Shawaa", category_id: 2, sku: "OCF-M-001",
    material: "Premium cotton blend with traditional gold and silver thread embroidery",
    care: "Gentle hand wash cold. Iron on low heat with pressing cloth.",
    sizes: '["S","M","L","XL","XXL"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-22.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-8.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-15.jpg"
    ]),
    is_best_seller: 1, is_featured: 1, is_new: 1, rating: 4.8, review_count: 89,
    badge: "new", badge_text: "New"
  },
  {
    name: "Traditional Wandabii Shawl",
    slug: "traditional-wandabii-shawl-arsii",
    description: "The Wandabii is the iconic shawl of the Arsii Oromo. Woven on traditional handlooms, each shawl takes 3 full days to complete. The circular motifs represent unity in Oromo philosophy. A timeless piece for weddings, Irreecha and everyday elegance.",
    short_desc: "Iconic Arsii handwoven shawl with circular unity motifs",
    price: 5500, compare_price: 6400, cost_price: 2500, stock: 35,
    region: "Arsii", category_id: 4, sku: "OCF-A-001",
    material: "Pure wool with natural plant-based dyes. Handloomed.",
    care: "Dry clean recommended. Hand wash cold possible. Lay flat to dry.",
    sizes: '["One Size"]',
    images: JSON.stringify([
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5093843040_m6o4-362453.jpg",
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5142065825_8z3q-975614.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-3.jpg"
    ]),
    is_best_seller: 0, is_featured: 1, is_new: 0, rating: 4.7, review_count: 67,
    badge: "sale", badge_text: "14% Off"
  },
  {
    name: "Beaded Necklace & Bracelet Set",
    slug: "beaded-necklace-bracelet-set",
    description: "Handstrung seed bead jewelry representing the five Oromo regions. Each bead is selected for its color significance in Oromo tradition: green for peace and nature, yellow for wealth and harvest, red for strength and courage. Each set is unique.",
    short_desc: "Handstrung multi-region Oromo seed bead jewelry set",
    price: 3000, compare_price: null, cost_price: 900, stock: 62,
    region: "All Regions", category_id: 4, sku: "OCF-ACC-001",
    material: "Glass seed beads, brass spacers, natural cotton cord",
    care: "Avoid water and perfume. Store in soft pouch provided.",
    sizes: '["One Size"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-16.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-9.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-20.jpg"
    ]),
    is_best_seller: 1, is_featured: 0, is_new: 1, rating: 5.0, review_count: 201,
    badge: "new", badge_text: "New"
  },
  {
    name: "Children's Traditional Outfit",
    slug: "childrens-traditional-outfit-harargee",
    description: "Miniature traditional attire for children ages 3–12. Identical embroidery patterns to our adult pieces — so the whole family can match at Irreecha and weddings. Eastern Oromia's star and sun motifs are prominent, reflecting the region's connection to Islamic geometric art.",
    short_desc: "Harargee traditional children's outfit with star motifs",
    price: 7000, compare_price: 8500, cost_price: 3200, stock: 22,
    region: "Harargee", category_id: 3, sku: "OCF-C-001",
    material: "Soft cotton blend with child-safe natural dyes. Machine washable.",
    care: "Machine wash gentle cycle, cold water. Tumble dry low.",
    sizes: '["3-4yr","5-6yr","7-8yr","9-10yr","11-12yr"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-10.jpg",
      "https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5061815171_s1wj-162220.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-4.jpg"
    ]),
    is_best_seller: 0, is_featured: 0, is_new: 1, rating: 4.9, review_count: 45,
    badge: "new", badge_text: "New"
  },
  {
    name: "Booranaa Heritage Dress",
    slug: "booranaa-heritage-dress",
    description: "The Booranaa dress is distinguished by its bold geometric minimalism and deep natural indigo base. The pastoral Booranaa Oromo express identity through the most meaningful symbolic density of any Oromo region — every pattern element carries specific cultural meaning.",
    short_desc: "Bold geometric Booranaa dress in natural indigo",
    price: 13500, compare_price: 16000, cost_price: 6500, stock: 11,
    region: "Booranaa", category_id: 1, sku: "OCF-W-002",
    material: "Handwoven cotton with natural indigo dye from local plants",
    care: "Dry clean only. Do not bleach. First wash may release slight dye.",
    sizes: '["XS","S","M","L","XL","XXL"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-5.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-11.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-18.jpg"
    ]),
    is_best_seller: 1, is_featured: 1, is_new: 0, rating: 4.9, review_count: 88,
    badge: "hot", badge_text: "Popular"
  },
  {
    name: "Groom's Wedding Outfit",
    slug: "grooms-wedding-outfit-shawaa",
    description: "The pinnacle of Oromo men's ceremonial dress. Complete groom's attire including embroidered shirt, wide-leg trousers, cape with shoulder embroidery, and matching belt. The gold thread work on this piece represents approximately 40 hours of artisan labor.",
    short_desc: "Complete Shawaa groom's attire with gold thread embroidery",
    price: 16000, compare_price: 19000, cost_price: 8000, stock: 8,
    region: "Shawaa", category_id: 5, sku: "OCF-M-002",
    material: "Premium cotton with gold thread hand embroidery. Includes cape and belt.",
    care: "Dry clean only. Press with steam iron on reverse. Store in garment bag.",
    sizes: '["S","M","L","XL","XXL"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-24.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-13.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-30.jpg"
    ]),
    is_best_seller: 1, is_featured: 1, is_new: 0, rating: 5.0, review_count: 33,
    badge: "hot", badge_text: "Wedding"
  },
  {
    name: "Contemporary Fusion Dress",
    slug: "contemporary-fusion-dress",
    description: "Traditional Oromo embroidery meets contemporary silhouettes. Designed for the modern Oromo woman who wants to honor her roots at formal events without compromising on style. The embroidery is done by Wallagga artisans; the cut is designed in Addis Ababa.",
    short_desc: "Modern silhouette with authentic Oromo embroidery",
    price: 10500, compare_price: null, cost_price: 5000, stock: 19,
    region: "Modern Collection", category_id: 1, sku: "OCF-W-003",
    material: "Cotton-linen blend with silk embroidery accents. Fully lined.",
    care: "Machine wash cold, gentle cycle. Hang to dry. Do not wring.",
    sizes: '["XS","S","M","L","XL"]',
    images: JSON.stringify([
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-28.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-19.jpg",
      "https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-27.jpg"
    ]),
    is_best_seller: 0, is_featured: 1, is_new: 1, rating: 4.6, review_count: 52,
    badge: "new", badge_text: "New Drop"
  }
];

const seedBundles = [
  {
    name: "Family Bundle", slug: "family-bundle", icon: "👨‍👩‍👧‍👦",
    description: "Dress the whole family for your special occasion in matching traditional attire. Coordinate across generations with pieces that speak the same aesthetic language.",
    items_json: JSON.stringify(["2 Adult Women's Dresses (Wallagga)","2 Children's Traditional Outfits","4 Matching Wandabii Shawls","Free premium gift wrapping"]),
    price: 38000, compare_price: 48000, discount_pct: 21, savings: 10000, is_featured: 0
  },
  {
    name: "Wedding Bundle", slug: "wedding-bundle", icon: "💍",
    description: "Complete wedding attire for couple and parents. Your most meaningful day deserves the most meaningful pieces. Every item individually selected for ceremonial significance.",
    items_json: JSON.stringify(["Bride's Ceremonial Dress (Shawaa)","Groom's Wedding Outfit","2 Parents' Traditional Outfits","Premium gift box + free worldwide shipping"]),
    price: 55000, compare_price: 65000, discount_pct: 15, savings: 10000, is_featured: 1
  },
  {
    name: "Irreecha Group Pack", slug: "irreecha-group-pack", icon: "🌿",
    description: "Celebrate Irreecha together in coordinated outfits. Perfect for community groups, organizations, and extended families wanting a unified look at the harvest festival.",
    items_json: JSON.stringify(["8 Traditional Outfits (Mixed Sizes)","4 FREE Extra Outfits","Coordinated color palette","Custom embroidery with group name"]),
    price: 96000, compare_price: 144000, discount_pct: 33, savings: 48000, is_featured: 0
  },
  {
    name: "Graduation Bundle", slug: "graduation-bundle", icon: "🎓",
    description: "Celebrate academic achievement the traditional way. Graduate and family matching attire set, complete with accessories.",
    items_json: JSON.stringify(["1 Graduate's Ceremonial Dress/Outfit","2 Parent Outfits","1 Children's Outfit","Beaded accessories set"]),
    price: 42000, compare_price: 55000, discount_pct: 24, savings: 13000, is_featured: 0
  },
  {
    name: "Diaspora Gift Set", slug: "diaspora-gift-set", icon: "🎁",
    description: "Send heritage home. A curated gift set for diaspora customers to gift to family or fellow community members.",
    items_json: JSON.stringify(["1 Premium Wandabii Shawl","1 Beaded Jewelry Set","1 Heritage Print Scarf","Luxury gift box with handwritten card"]),
    price: 18000, compare_price: 24000, discount_pct: 25, savings: 6000, is_featured: 0
  }
];

const seedReviews = [
  { product_id: 1, guest_name: "Sara Alemu", guest_email: "sara@example.com", rating: 5, title: "Absolutely stunning!", comment: "The quality is unlike anything I've seen outside of Ethiopia. My family in Minneapolis couldn't believe it arrived in such perfect condition. Will order again.", location: "Minneapolis, USA 🇺🇸", is_verified: 1 },
  { product_id: 1, guest_name: "Mekdes Tadesse", guest_email: "mekdes@example.com", rating: 5, title: "Perfect for Irreecha", comment: "Ordered for our community Irreecha celebration. Everyone was amazed. The embroidery detail is extraordinary — you can tell real skill went into this.", location: "Atlanta, USA 🇺🇸", is_verified: 1 },
  { product_id: 2, guest_name: "Abdi Merga", guest_email: "abdi@example.com", rating: 5, title: "Wedding Bundle exceeded expectations", comment: "Ordered the Wedding Bundle for our traditional ceremony in Toronto. Everything arrived in 8 days, perfectly packaged. Our guests were amazed by the craftsmanship.", location: "Toronto, Canada 🇨🇦", is_verified: 1 },
  { product_id: 6, guest_name: "Liya Hunduma", guest_email: "liya@example.com", rating: 5, title: "Represents culture with dignity", comment: "OCF truly represents our culture with such dignity. I wore my dress to the Oromo community event in Melbourne and received compliments all evening.", location: "Melbourne, Australia 🇦🇺", is_verified: 1 },
  { product_id: 3, guest_name: "Chaltu Bekele", guest_email: "chaltu@example.com", rating: 4, title: "Beautiful shawl, fast delivery", comment: "Beautiful Wandabii shawl. Arrived to London in 7 days. The natural dyes are rich and the weave is tight and high quality. Only minor note — slightly smaller than expected.", location: "London, UK 🇬🇧", is_verified: 1 },
  { product_id: 7, guest_name: "Temesgen Worku", guest_email: "teme@example.com", rating: 5, title: "Best groom outfit I've seen", comment: "I was the groom. This outfit made me feel like royalty at my wedding. The gold thread work is breathtaking. Every single guest asked where I got it.", location: "Addis Ababa, Ethiopia 🇪🇹", is_verified: 1 }
];

const seedPromoCodes = [
  { code: "WELCOME10", type: "percent", value: 10, min_order: 5000, max_uses: 1000 },
  { code: "BUNDLE15", type: "percent", value: 15, min_order: 30000, max_uses: 500 },
  { code: "WEDDING20", type: "percent", value: 20, min_order: 50000, max_uses: 200 },
  { code: "SAVE10", type: "percent", value: 10, min_order: 0, max_uses: 2000 },
  { code: "IRREECHA33", type: "percent", value: 33, min_order: 90000, max_uses: 100 }
];

module.exports = { initSql, seedCategories, seedProducts, seedBundles, seedReviews, seedPromoCodes };
