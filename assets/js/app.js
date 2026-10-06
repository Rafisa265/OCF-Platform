/* ══════════════════════════════════════════════
   OCF FRONTEND v2 — Enhanced with Full
   Gender/Age/Category/Size/Color Management
══════════════════════════════════════════════ */


// ── STATE ──
const S = {
  page: 'home',
  cart: [],       // populated from PostgreSQL on login/load
  wishlist: [],   // populated from PostgreSQL on login/load
  compare: JSON.parse(localStorage.getItem('ocf_compare') || '[]'),
  recentlyViewed: JSON.parse(localStorage.getItem('ocf_recent') || '[]'),
  user: JSON.parse(localStorage.getItem('ocf_user') || 'null'),
  token: localStorage.getItem('ocf_token') || null,
  checkoutStep: 1,
  products: [],
  activeFilters: { gender: [], cat: [], size: [], color: [], coll: [], price: 70000, quickFilter: 'all', sort: '' },
  selectedSize: null,
  selectedColor: null,
  selectedQty: 1,
  modalProduct: null,
  kidsAgeFilter: 'all'
};

// Cart and wishlist are now sourced from the PostgreSQL backend for logged-in users.
// localStorage is no longer used as a persistent store for cart/wishlist.
const saveCart = () => {}; // no-op: backend is source of truth
const saveWish = () => {}; // no-op: backend is source of truth
const saveCompare = () => localStorage.setItem('ocf_compare', JSON.stringify(S.compare));
const saveRecent = () => localStorage.setItem('ocf_recent', JSON.stringify(S.recentlyViewed));
const saveAuth = () => { localStorage.setItem('ocf_token', S.token || ''); localStorage.setItem('ocf_user', JSON.stringify(S.user)); };



// ══════════════════════════════════════════
// PRODUCT DATA — Complete Catalog
// Men: T-Shirts, Polo Shirts, Hoodies, Jackets, Traditional, Suits, Sportswear
// Women: Dresses, Skirts, Blouses, Hijabs, Traditional, Wedding, Sportswear
// Kids: Boys, Girls, School, Traditional
// ══════════════════════════════════════════
let PRODUCTS = [];

let REVIEWS_DATA = {};

const LOCAL_BUNDLES = [
  { id:1, name:"Family Bundle", icon:"👨‍👩‍👧‍👦", desc:"Dress the whole family for your special occasion in matching traditional attire.", items:["2 Adult Women's Dresses (Wallagga)","1 Men's Traditional Outfit","2 Children's Outfits (Ages 4–12)","4 Matching Wandabii Shawls","Free premium gift wrapping"], price:55000, compare_price:72000, savings:17000, save_pct:24, featured:false },
  { id:2, name:"Wedding Bundle", icon:"💍", desc:"Complete wedding attire for couple and parents. Your most meaningful day, perfectly dressed.", items:["Bride's Ceremonial Dress (Custom)","Groom's Wedding Outfit","2 Parents' Traditional Outfits","4 Shawls & Accessories","Premium gift box + free worldwide shipping"], price:65000, compare_price:80000, savings:15000, save_pct:19, featured:true },
  { id:3, name:"Irreecha Group Pack", icon:"🌿", desc:"Celebrate Irreecha together. Perfect for communities, groups and organizations.", items:["8 Traditional Outfits (Mixed Sizes)","4 FREE Extra Outfits","Coordinated Oromo color palette","Custom embroidery with group name"], price:96000, compare_price:144000, savings:48000, save_pct:33, featured:false }
];

const FAQS = [
  ["How do I know my size?","Use our Size Guide with your bust, waist, and hip measurements. If between sizes, size up — Oromo garments are designed with generous flow. WhatsApp us your measurements for personal sizing advice."],
  ["Do you ship internationally?","Yes, worldwide shipping. Express (5–10 days) for USA, Canada, UK, Australia, Europe at $25. Standard (10–21 days) at $15. Free shipping on orders above Br 15,000 within Ethiopia."],
  ["Can I return if it doesn't fit?","Yes — 30-day easy returns. Items must be unworn in original packaging. International returns covered by OCF for size-related issues."],
  ["Do you do custom orders?","Yes! Custom orders at your measurements for any design in our catalog. Allow 2–4 weeks. Custom orders start at Br 15,000."],
  ["What payment methods do you accept?","Ethiopian: Chapa (Telebirr, CBE Birr, bank cards), Bank Transfer, Cash on Delivery. International: PayPal, Visa, Mastercard, Stripe."],
  ["Are products genuinely handmade?","Every piece is handcrafted by our 200+ artisan partners across five Oromo regions. We publish artisan profiles and maintain fair-wage certification."]
];

const COLLECTIONS_DATA = [
  { name:"Wallagga Collection", region:"Western Oromia", img:"https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5340931803_hd19-764744.jpg", desc:"The richest embroidery traditions in Oromia. Bold diamond patterns and gold-and-black color palette. Each piece takes up to 2 weeks to complete.", pieces:42 },
  { name:"Shawaa Collection", region:"Central Oromia", img:"https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-8.jpg", desc:"Fine embroidery with delicate color gradients, incorporating silver thread alongside gold. Reflects the cultural crossroads of Ethiopia.", pieces:38 },
  { name:"Arsii Collection", region:"Southeast Oromia", img:"https://www.ethiopian.store/cdn/shop/files/il_fullxfull.5142065825_8z3q-975614.jpg", desc:"The Wandabii shawl — arguably the most iconic piece of Oromo fashion. Flowing silhouettes and circular motifs representing unity.", pieces:31 },
  { name:"Harargee Collection", region:"Eastern Oromia", img:"https://www.ethiopian.store/cdn/shop/files/il_fullxfull.4895361274_ii1x-424988.jpg", desc:"Blends Oromo aesthetics with Harari influences. Star and sun motifs, reflecting the region's connection to geometric art.", pieces:27 },
  { name:"Booranaa Collection", region:"Southern Oromia", img:"https://allaboutethio.com/images/modern-cultural-traditional-oromo-clothes-11.jpg", desc:"Bold geometric minimalism. Deep indigo and earth tones. Simplest silhouettes, most meaningful symbolic density.", pieces:24 }
];

const MEN_CATS = [
  { icon:"👔", name:"T-Shirts & Tops", val:"shirt", count:12 },
  { icon:"🧴", name:"Polo Shirts", val:"polo", count:8 },
  { icon:"🧥", name:"Hoodies", val:"hoodie", count:7 },
  { icon:"🥋", name:"Jackets", val:"jacket", count:10 },
  { icon:"🌿", name:"Traditional Wear", val:"traditional", count:18 },
  { icon:"🎩", name:"Suits & Formal", val:"suit", count:6 },
  { icon:"⚽", name:"Sportswear", val:"sport", count:9 }
];
const WOMEN_CATS = [
  { icon:"👗", name:"Dresses", val:"dress", count:22 },
  { icon:"👘", name:"Skirts", val:"skirt", count:11 },
  { icon:"👚", name:"Blouses & Tops", val:"shirt", count:14 },
  { icon:"🧕", name:"Hijabs", val:"hijab", count:9 },
  { icon:"🌿", name:"Traditional Wear", val:"traditional", count:20 },
  { icon:"💍", name:"Wedding Dresses", val:"wedding", count:6 },
  { icon:"⚽", name:"Sportswear", val:"sport", count:8 }
];
const KIDS_CATS = [
  { icon:"👦", name:"Boys Wear", val:"boys", count:18 },
  { icon:"👧", name:"Girls Wear", val:"girls", count:21 },
  { icon:"🎒", name:"School Uniforms", val:"uniform", count:12 },
  { icon:"🌿", name:"Traditional Wear", val:"traditional", count:15 }
];

// ── COLOR MAP ──
const COLOR_NAMES = {
  "#D4A843":"Gold", "#1a1a1a":"Black", "#f0f0f0":"White", "#c0392b":"Red",
  "#2980b9":"Blue", "#27ae60":"Green", "#f1c40f":"Yellow", "#8B4513":"Brown",
  "#7B4D2E":"Oromo Earth", "#1B4F6E":"Oromo Sky", "#2B5C2B":"Oromo Grass"
};

// ── NAVIGATION ──
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); S.page = page; }
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const nl = document.getElementById('nl-' + page);
  if (nl) nl.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeAll();
  // Page-specific init
  if (page === 'products') initShopAll();
  if (page === 'men') initGenderPage('men');
  if (page === 'women') initGenderPage('women');
  if (page === 'kids') initGenderPage('kids');
  if (page === 'collections') renderCollections();
  if (page === 'bundles') renderBundlesPage();
  if (page === 'faq') renderFAQ();
  if (page === 'wishlist') renderWishlist();
  if (page === 'checkout') { S.checkoutStep = 1; renderCheckout(); }
  if (page === 'account') { if (!S.user) { openAuth(); return; } initAccountPage(); }
  if (page === 'admin')   { if (!S.user || S.user.role !== 'admin') { openAuth(); return; } initAdmin(); }
  renderRecentlyViewed();
}

// ── GENDER PAGE INIT ──
function initGenderPage(gender) {
  const cats = gender === 'men' ? MEN_CATS : gender === 'women' ? WOMEN_CATS : KIDS_CATS;
  const catGrid = document.getElementById(gender + 'CatGrid');
  if (catGrid) catGrid.innerHTML = cats.map(c => `
    <div class="cat-card" onclick="filterGenderCat('${gender}','${c.val}',this)">
      <div class="cat-card-icon">${c.icon}</div>
      <div class="cat-card-name">${c.name}</div>
      <div class="cat-card-count">${c.count} items</div>
    </div>`).join('');
  renderSidebar(gender);
  loadGenderProducts(gender);
}

function renderSidebar(gender) {
  const sb = document.getElementById(gender + 'Sidebar');
  if (!sb) return;
  sb.innerHTML = `
    <div class="sidebar-section">
      <div class="t-label" style="margin-bottom:.75rem">Size</div>
      ${gender === 'kids' ? `
        <div class="size-filter-grid">
          ${["2-3yr","4-5yr","6-7yr","8-9yr","10-12yr","13-15yr"].map(s => `<div class="sfb" onclick="toggleSizeFilter(this,'${s}')">${s.replace('yr','')}</div>`).join('')}
        </div>
      ` : `
        <div class="size-filter-grid">
          ${["XS","S","M","L","XL","XXL","XXXL"].map(s => `<div class="sfb" onclick="toggleSizeFilter(this,'${s}')">${s}</div>`).join('')}
        </div>
      `}
    </div>
    <div class="sidebar-section">
      <div class="t-label" style="margin-bottom:.75rem">Color</div>
      <div class="color-swatch-filter">
        <div class="csf" style="background:#1a1a1a;border:2px solid #555" onclick="toggleColorFilter(this,'black')" title="Black"></div>
        <div class="csf" style="background:#f0f0f0;border:2px solid #ccc" onclick="toggleColorFilter(this,'white')" title="White"></div>
        <div class="csf" style="background:#c0392b" onclick="toggleColorFilter(this,'red')" title="Red"></div>
        <div class="csf" style="background:#2980b9" onclick="toggleColorFilter(this,'blue')" title="Blue"></div>
        <div class="csf" style="background:#27ae60" onclick="toggleColorFilter(this,'green')" title="Green"></div>
        <div class="csf" style="background:#D4A843" onclick="toggleColorFilter(this,'gold')" title="Gold"></div>
        <div class="csf" style="background:linear-gradient(135deg,#7B4D2E,#D4A843,#2B5C2B)" onclick="toggleColorFilter(this,'oromo')" title="Oromo Cultural"></div>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="t-label" style="margin-bottom:.75rem">Price Range (Br)</div>
      <input type="range" min="500" max="35000" step="500" value="35000" style="width:100%;accent-color:var(--gold)" oninput="this.nextElementSibling.textContent='Up to Br '+parseInt(this.value).toLocaleString()">
      <div style="font-size:.75rem;color:var(--muted);margin-top:.35rem">Up to Br 35,000</div>
    </div>`;
}

function filterGenderCat(gender, cat, btn) {
  document.querySelectorAll(`#${gender}CatGrid .cat-card`).forEach(c => c.classList.remove('active-cat'));
  btn.classList.add('active-cat');
  loadGenderProducts(gender, '', cat);
}

function loadGenderProducts(gender, sort='', cat='') {
  const grid = document.getElementById(gender + 'ProductsGrid');
  const count = document.getElementById(gender + 'ProdCount');
  if (!grid) return;
  let products = PRODUCTS.filter(p => p.gender === gender);
  if (cat) products = products.filter(p => p.cat === cat);
  if (sort === 'price-low') products.sort((a,b) => a.price - b.price);
  if (sort === 'price-high') products.sort((a,b) => b.price - a.price);
  if (sort === 'rating') products.sort((a,b) => b.rating - a.rating);
  if (sort === 'newest') products.sort((a,b) => b.id - a.id);
  if (count) count.textContent = `Showing ${products.length} products`;
  grid.innerHTML = products.map(productCard).join('') || '<div style="color:var(--muted);padding:2rem">No products found for this filter.</div>';
}

function filterKidsAge(age, btn) {
  document.querySelectorAll('.age-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.kidsAgeFilter = age;
  const grid = document.getElementById('kidsProductsGrid');
  const count = document.getElementById('kidsProdCount');
  let products = PRODUCTS.filter(p => p.gender === 'kids');
  if (age !== 'all') products = products.filter(p => (p.ageRange || []).includes(age));
  if (count) count.textContent = `Showing ${products.length} products`;
  grid.innerHTML = products.map(productCard).join('') || '<div style="color:var(--muted);padding:2rem">No products for this age group.</div>';
}

// ── SHOP ALL INIT ──
function initShopAll() {
  S.activeFilters = { gender: [], cat: [], size: [], color: [], coll: [], price: 70000, quickFilter: 'all', sort: '' };
  applyFilters();
}

// ── FILTER SYSTEM ──
function toggleSizeFilter(el, size) {
  el.classList.toggle('active');
  const idx = S.activeFilters.size.indexOf(size);
  if (idx === -1) S.activeFilters.size.push(size);
  else S.activeFilters.size.splice(idx, 1);
  applyFilters();
}

function toggleColorFilter(el, color) {
  el.classList.toggle('active');
  const idx = S.activeFilters.color.indexOf(color);
  if (idx === -1) S.activeFilters.color.push(color);
  else S.activeFilters.color.splice(idx, 1);
  applyFilters();
}

function quickFilter(val, btn) {
  document.querySelectorAll('[id^="qf-"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.activeFilters.quickFilter = val;
  applyFilters();
}

function filterProducts(type) {
  S.activeFilters.quickFilter = type;
}

function applyFilters() {
  const grid = document.getElementById('allProductsGrid');
  const count = document.getElementById('prodCount');
  if (!grid) return;

  // Collect checkbox filters
  const genderChecks = [...document.querySelectorAll('[data-filter="gender"]:checked')].map(e => e.dataset.val);
  const catChecks = [...document.querySelectorAll('[data-filter="cat"]:checked')].map(e => e.dataset.val);
  const collChecks = [...document.querySelectorAll('[data-filter="coll"]:checked')].map(e => e.dataset.val);
  const priceMax = parseInt(document.getElementById('priceRange')?.value || 70000);
  const sort = document.getElementById('mainSort')?.value || '';

  let products = [...PRODUCTS];

  // Quick filter
  const qf = S.activeFilters.quickFilter;
  if (qf === 'new') products = products.filter(p => p.badge === 'new');
  else if (qf === 'bestseller') products = products.filter(p => p.badge === 'bestseller');
  else if (qf === 'sale') products = products.filter(p => p.compare_price);
  else if (qf === 'featured') products = products.filter(p => p.badge === 'featured');
  else if (qf === 'oromo') products = products.filter(p => p.badge === 'oromo');

  // Checkbox filters
  if (genderChecks.length) products = products.filter(p => genderChecks.includes(p.gender));
  if (catChecks.length) products = products.filter(p => catChecks.includes(p.cat));
  if (collChecks.length) {
    products = products.filter(p => {
      return collChecks.some(c => {
        if (c === 'new') return p.badge === 'new';
        if (c === 'bestseller') return p.badge === 'bestseller';
        if (c === 'sale') return !!p.compare_price;
        if (c === 'featured') return p.badge === 'featured';
        return false;
      });
    });
  }
  if (S.activeFilters.size.length) products = products.filter(p => S.activeFilters.size.some(s => (p.sizes || []).includes(s)));
  products = products.filter(p => p.price <= priceMax);

  // Sort
  if (sort === 'price-low') products.sort((a,b) => a.price - b.price);
  else if (sort === 'price-high') products.sort((a,b) => b.price - a.price);
  else if (sort === 'rating') products.sort((a,b) => b.rating - a.rating);
  else if (sort === 'newest') products.sort((a,b) => b.id - a.id);

  if (count) count.textContent = `Showing ${products.length} of ${PRODUCTS.length} products`;
  grid.innerHTML = products.map(productCard).join('') || `<div style="text-align:center;padding:3rem;color:var(--muted)">No products match your filters.<br><button class="btn btn-outline btn-sm" style="margin-top:1rem" onclick="clearFilters()">Clear Filters</button></div>`;
}

function clearFilters() {
  document.querySelectorAll('[data-filter]').forEach(el => el.checked = false);
  document.querySelectorAll('.sfb,.csf').forEach(el => el.classList.remove('active'));
  const pr = document.getElementById('priceRange');
  if (pr) { pr.value = 70000; document.getElementById('priceVal').textContent = 'Up to Br 70,000'; }
  S.activeFilters = { gender:[], cat:[], size:[], color:[], coll:[], price:70000, quickFilter:'all', sort:'' };
  document.querySelectorAll('[id^="qf-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('qf-all')?.classList.add('active');
  applyFilters();
}

// ── PRODUCT CARD ──
function productCard(p) {
  const rawImg = Array.isArray(p.images) ? p.images[0] : (p.images || '');
  const img = typeof getMediaUrl === 'function' ? getMediaUrl(rawImg) : rawImg;
  const wishlisted = S.wishlist.includes(p.id);
  const compared = S.compare.includes(p.id);
  const badgeCls = { bestseller:'badge-red', new:'badge-new', sale:'badge-sale', featured:'badge-featured', oromo:'badge-oromo', hot:'badge-red' }[p.badge] || 'badge-outline';
  const stockCls = p.stock <= 3 ? 'stock-low' : p.stock === 0 ? 'stock-out' : 'stock-in';
  const stockTxt = p.stock === 0 ? '✕ Out of Stock' : p.stock <= 3 ? `⚠ Only ${p.stock} left` : `✓ In Stock`;
  const discount = p.compare_price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  
  return `<div class="product-card" onclick="openModal(${p.id})">
    <div class="pc-img">
      <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy">
      <div class="pc-badges">
        ${p.badge_text ? `<span class="badge ${badgeCls}">${escapeHtml(p.badge_text)}</span>` : ''}
        ${discount > 0 ? `<span class="badge badge-sale">${discount}% Off</span>` : ''}
      </div>
      <div class="pc-actions">
        <button class="btn-icon${wishlisted?' active':''}" onclick="event.stopPropagation();toggleWish(${p.id},this)" title="Wishlist" data-wish="${p.id}">${wishlisted ? '❤️' : '♡'}</button>
        <button class="btn-icon${compared?' compare-active':''}" onclick="event.stopPropagation();toggleCompare(${p.id},this)" title="Compare" data-cmp="${p.id}">⚖</button>
        <button class="btn-icon" onclick="event.stopPropagation();openModal(${p.id})" title="Quick view">👁</button>
      </div>
      <div class="pc-view-btns">
        <button class="pc-view-btn" onclick="event.stopPropagation();openModal(${p.id})">Quick View</button>
        <button class="pc-view-btn" onclick="event.stopPropagation();quickAddToCart(${p.id})">Add to Cart</button>
      </div>
    </div>
    <div class="pc-body">
      <div class="pc-region">${escapeHtml(p.region)}</div>
      <div class="pc-name">${escapeHtml(p.name)}</div>
      <div class="pc-cat" style="font-size:.62rem;color:var(--muted)">${p.gender ? escapeHtml(p.gender.charAt(0).toUpperCase()+p.gender.slice(1)) : ''} · ${escapeHtml(p.cat || '')}</div>
      <div class="pc-stars">${'★'.repeat(Math.round(p.rating||5))}${'☆'.repeat(5-Math.round(p.rating||5))} <span>(${p.review_count||0})</span></div>
      <div class="pc-colors">${(p.colors||[]).slice(0,4).map(c=>`<div class="pc-color" style="background:${c.startsWith('#')&&c.length>4?c:'#888'}" title="${escapeHtml(COLOR_NAMES[c]||c)}"></div>`).join('')}</div>
      <div class="pc-sizes-preview">${(p.sizes||[]).slice(0,5).map(s=>`<div class="pc-size-dot">${escapeHtml(s)}</div>`).join('')}${p.sizes?.length>5?`<div class="pc-size-dot">+${p.sizes.length-5}</div>`:''}</div>
      <div class="stock-indicator ${stockCls}" style="font-size:.62rem;margin-bottom:.3rem">${stockTxt}</div>
      <div class="pc-footer">
        <div>
          <div class="pc-price">Br ${(p.price||0).toLocaleString()}</div>
          ${p.compare_price ? `<div class="pc-price-old">Br ${p.compare_price.toLocaleString()}</div>` : ''}
        </div>
        <button class="pc-add" onclick="event.stopPropagation();quickAddToCart(${p.id})" title="Add to cart" ${p.stock===0?'disabled style="opacity:.4"':''}>+</button>
      </div>
    </div>
  </div>`;
}

// ── HOME PRODUCTS ──
function filterHome(btn, filter) {
  document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  let products = [...PRODUCTS];
  if (filter === 'new') products = products.filter(p => p.badge === 'new');
  else if (filter === 'bestseller') products = products.filter(p => p.badge === 'bestseller');
  else if (filter === 'sale') products = products.filter(p => p.compare_price);
  else if (filter === 'oromo') products = products.filter(p => p.badge === 'oromo');
  document.getElementById('homeGrid').innerHTML = `<div class="products-grid">${products.slice(0,8).map(productCard).join('')}</div>`;
}

function filterGender(gender, btn) {
  document.querySelectorAll('.g-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  let products = gender === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.gender === gender);
  document.getElementById('homeGrid').innerHTML = `<div class="products-grid">${products.slice(0,8).map(productCard).join('')}</div>`;
}

function loadHomeProducts() {
  const grid = document.getElementById('homeGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="products-grid">${PRODUCTS.slice(0,8).map(productCard).join('')}</div>`;
}

function loadHomeBundles() {
  const el = document.getElementById('homeBundles');
  if (!el) return;
  el.innerHTML = LOCAL_BUNDLES.slice(0,3).map(b => `
    <div class="bundle-card${b.featured?' featured':''}">
      ${b.featured ? '<div class="bundle-tag">Most Popular</div>' : ''}
      <div class="bundle-icon">${b.icon}</div>
      <div class="bundle-name">${b.name}</div>
      <div class="bundle-desc">${b.desc}</div>
      <ul class="bundle-list">${b.items.map(i=>`<li>${i}</li>`).join('')}</ul>
      <div class="bundle-prices"><div class="bundle-price">Br ${b.price.toLocaleString()}</div><div class="bundle-price-old">Br ${b.compare_price.toLocaleString()}</div></div>
      <div class="bundle-save">🎁 Save Br ${b.savings.toLocaleString()} — ${b.save_pct}% OFF</div>
      <button class="btn${b.featured?' btn-gold':' btn-outline'} btn-block" onclick="bundleToCart('${b.name}',${b.price})">Add Bundle to Cart</button>
    </div>`).join('');
}

// ── COMPARE ──
function toggleCompare(id, btn) {
  const idx = S.compare.indexOf(id);
  if (idx === -1) {
    if (S.compare.length >= 3) { toast('Max 3 items for comparison', 'error'); return; }
    S.compare.push(id); toast('Added to comparison ⚖');
  } else { S.compare.splice(idx, 1); toast('Removed from comparison'); }
  saveCompare();
  document.querySelectorAll(`[data-cmp="${id}"]`).forEach(b => b.classList.toggle('compare-active', S.compare.includes(id)));
  updateCompareBar();
}

function updateCompareBar() {
  const bar = document.getElementById('compareBar');
  const cnt = document.getElementById('compareCount');
  if (cnt) cnt.textContent = S.compare.length;
  if (bar) bar.classList.toggle('show', S.compare.length > 0);
}

function clearCompare() {
  S.compare = []; saveCompare();
  document.querySelectorAll('[data-cmp]').forEach(b => b.classList.remove('compare-active'));
  updateCompareBar();
}

function showCompareModal() {
  if (!S.compare.length) { toast('Select products to compare first', 'error'); return; }
  const items = S.compare.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  const fields = [
    ['Image', p => `<img src="${p.images[0]}" style="width:100%;height:160px;object-fit:cover;border-radius:var(--r)">`],
    ['Name', p => `<strong>${p.name}</strong>`],
    ['Gender', p => p.gender],
    ['Category', p => p.cat],
    ['Region', p => p.region],
    ['Price', p => `<strong style="color:var(--gold)">Br ${p.price.toLocaleString()}</strong>`],
    ['Sizes', p => (p.sizes||[]).join(', ')],
    ['Rating', p => '★'.repeat(Math.round(p.rating||5)) + ` (${p.review_count})`],
    ['Stock', p => p.stock > 3 ? '✅ In Stock' : p.stock > 0 ? `⚠ ${p.stock} left` : '❌ Out of Stock'],
    ['Material', p => p.material],
  ];
  document.getElementById('compareContent').innerHTML = `
    <div style="display:grid;grid-template-columns:120px ${items.map(()=>'1fr').join(' ')};gap:1rem">
      ${fields.map(([label, fn]) => `
        <div class="cmp-row-label" style="padding-top:.5rem;font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)">${label}</div>
        ${items.map(p => `<div class="cmp-row" style="font-size:.78rem;color:var(--muted2)">${fn(p)}</div>`).join('')}
      `).join('')}
      <div></div>
      ${items.map(p => `<div><button class="btn btn-gold btn-sm btn-block" onclick="quickAddToCart(${p.id});closeCompareModal()">Add to Cart</button></div>`).join('')}
    </div>`;
  document.getElementById('compareModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
}

function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
}

// ── RECENTLY VIEWED ──
function addToRecentlyViewed(id) {
  S.recentlyViewed = [id, ...S.recentlyViewed.filter(i => i !== id)].slice(0, 6);
  saveRecent();
}

function renderRecentlyViewed() {
  const wrap = document.getElementById('recentlyViewed');
  const grid = document.getElementById('recentlyViewedGrid');
  if (!wrap || !grid) return;
  const items = S.recentlyViewed.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  wrap.style.display = items.length ? 'block' : 'none';
  if (items.length) grid.innerHTML = items.map(productCard).join('');
}

// ── PRODUCT MODAL (enhanced with zoom, reviews, related) ──
async function openModal(id) {
  S.selectedSize = null; S.selectedColor = null; S.selectedQty = 1;
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  S.modalProduct = p;
  addToRecentlyViewed(id);
  const rawImgs = Array.isArray(p.images) ? p.images : [p.images];
  const imgs = rawImgs.map(im => typeof getMediaUrl === 'function' ? getMediaUrl(im) : im);
  const pct = p.compare_price ? Math.round((1 - p.price / p.compare_price) * 100) : null;
  S.selectedSize = p.sizes?.[p.sizes.length > 2 ? 1 : 0];
  S.selectedColor = p.colors?.[0];
  
  let reviews = [];
  let avgRating = p.rating;
  try {
    const res = await api('/products/' + id + '/reviews');
    if (res && res.reviews) {
      reviews = res.reviews.map(r => ({ author: r.guest_name || 'Customer', rating: parseFloat(r.rating), date: new Date(r.created_at).toLocaleDateString(), text: r.comment }));
      avgRating = res.average || p.rating;
    }
  } catch(e) {}

  document.getElementById('modalBox').innerHTML = `
    <div class="modal-grid" style="position:relative">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <!-- IMAGE SECTION with zoom -->
      <div class="modal-img">
        <div class="img-zoom-wrap" id="zoomWrap" onmousemove="handleZoom(event,this)">
          <img src="${imgs[0]}" alt="${p.name}" id="mainImg" class="modal-img-main">
        </div>
        <div class="modal-img-thumbs">
          ${imgs.map((img,i) => `<div class="modal-thumb${i===0?' active':''}" onclick="switchImg('${img}',this)"><img src="${img}" alt="View ${i+1}"></div>`).join('')}
          <!-- Placeholder views for front/back/side -->
          ${imgs.length < 2 ? `
            <div class="modal-thumb" style="background:var(--ink3);display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--muted);text-align:center">Front</div>
            <div class="modal-thumb" style="background:var(--ink3);display:flex;align-items:center;justify-content:center;font-size:.6rem;color:var(--muted);text-align:center">Back</div>
          ` : ''}
        </div>
        <div style="padding:.5rem .75rem;background:rgba(0,0,0,.4);font-size:.62rem;color:var(--muted);text-align:center">🔍 Hover image to zoom</div>
      </div>
      <!-- PRODUCT DETAILS -->
      <div class="modal-body">
        <div class="t-eyebrow" style="margin-bottom:.25rem">${p.region}</div>
        <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;line-height:1.2;margin-bottom:.4rem">${p.name}</h2>
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <div style="color:var(--gold);font-size:.8rem">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5-Math.round(avgRating))}</div>
          <span style="font-size:.72rem;color:var(--muted)">${avgRating} · ${p.review_count||reviews.length} reviews</span>
          <span class="badge ${p.badge==='oromo'?'badge-oromo':p.badge==='bestseller'?'badge-red':'badge-new'}" style="margin-left:.25rem">${p.badge_text||''}</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:.75rem">
          <div style="font-size:1.55rem;font-weight:700">Br ${(p.price||0).toLocaleString()}</div>
          ${p.compare_price ? `<div style="font-size:.88rem;color:var(--muted);text-decoration:line-through">Br ${p.compare_price.toLocaleString()}</div><span class="badge badge-sale">${pct}% OFF</span>` : ''}
        </div>
        <div class="stock-indicator ${p.stock<=3?(p.stock===0?'stock-out':'stock-low'):'stock-in'}" style="margin-bottom:.75rem">
          ${p.stock===0?'✕ Out of Stock':p.stock<=3?`⚠ Only ${p.stock} left in stock`:`✓ In Stock (${p.stock} available)`}
        </div>
        <!-- SIZE GUIDE LINK -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
          <div class="t-label">Select Size</div>
          <button style="font-size:.68rem;color:var(--gold);background:none;border:none;cursor:pointer;text-decoration:underline" onclick="closeModal();go('size-guide')">📏 Size Guide</button>
        </div>
        <div class="size-grid">
          ${(p.sizes||['S','M','L','XL']).map(s => `<button class="size-btn${s===S.selectedSize?' active':''}" onclick="selectSize('${s}',this)">${s}</button>`).join('')}
        </div>
        <!-- COLOR PICKER -->
        ${p.colors?.length ? `
          <div class="t-label" style="margin-bottom:.4rem">Color: <span id="selColorName" style="font-weight:400;color:var(--muted2);text-transform:none">${COLOR_NAMES[p.colors[0]]||p.colors[0]}</span></div>
          <div class="color-picker">
            ${p.colors.map((c,i) => `<div class="cpick${i===0?' active':''}" style="background:${c.startsWith('#')&&c.length>4?c:'#888'}" onclick="selectColor('${c}',this)" title="${COLOR_NAMES[c]||c}"></div>`).join('')}
          </div>
        ` : ''}
        <!-- QTY -->
        <div class="qty-row">
          <div class="t-label">Qty</div>
          <div class="qty-box">
            <button onclick="chModalQty(-1)">−</button>
            <span id="mqty">1</span>
            <button onclick="chModalQty(1)">+</button>
          </div>
          <div id="msubtotal" style="font-size:.82rem;color:var(--muted)">Br ${(p.price||0).toLocaleString()}</div>
        </div>
        <!-- ACTIONS -->
        <div style="display:flex;gap:.6rem;margin-bottom:.75rem">
          <button class="btn btn-gold" style="flex:1" onclick="addToCart({id:${p.id},name:'${p.name.replace(/'/g,"\\'")}',price:${p.price},size:S.selectedSize,color:S.selectedColor,image:'${imgs[0]}',qty:S.selectedQty});closeModal()" ${p.stock===0?'disabled':''}>${p.stock===0?'Out of Stock':'Add to Cart'}</button>
          <button class="btn-icon${S.wishlist.includes(p.id)?' active':''}" onclick="toggleWish(${p.id},this)" data-wish="${p.id}" title="Wishlist">${S.wishlist.includes(p.id)?'❤️':'♡'}</button>
          <button class="btn-icon${S.compare.includes(p.id)?' compare-active':''}" onclick="toggleCompare(${p.id},this)" data-cmp="${p.id}" title="Compare">⚖</button>
        </div>
        <a href="https://wa.me/251900000000?text=Hi, I'm interested in ${encodeURIComponent(p.name)}" target="_blank" class="btn btn-ghost btn-block" style="margin-bottom:.6rem">💬 Ask on WhatsApp</a>
        ${p.stock===0?`<button class="btn btn-outline btn-block" style="margin-bottom:.6rem;border-color:var(--muted)" onclick="notifyWhenBack(${p.id})">🔔 Notify Me When Back in Stock</button>`:''}
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
          <button class="pdf-btn" style="flex:1;justify-content:center" onclick="downloadPDF('product-${p.id}')">📄 Product Brochure</button>
          <button class="pdf-btn" style="flex:1;justify-content:center" onclick="shareProduct(${p.id})">🔗 Share</button>
        </div>
        <!-- TABS -->
        <div class="modal-tabs">
          <button class="m-tab active" onclick="switchMTab(this,'mdesc')">Description</button>
          <button class="m-tab" onclick="switchMTab(this,'mmat')">Materials & Care</button>
          <button class="m-tab" onclick="switchMTab(this,'mrev')">Reviews (${p.review_count||reviews.length})</button>
          <button class="m-tab" onclick="switchMTab(this,'mship')">Shipping</button>
        </div>
        <div id="mdesc" class="m-tab-body">${p.description||''}</div>
        <div id="mmat" class="m-tab-body hidden"><strong style="color:var(--ivory2);font-size:.82rem">Material:</strong> ${p.material||'Premium handwoven cotton'}<br><br><strong style="color:var(--ivory2);font-size:.82rem">Care:</strong> ${p.care||'Dry clean only.'}</div>
        <div id="mrev" class="m-tab-body hidden">
          ${reviews.length ? `
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
              <div style="font-size:2.5rem;font-weight:700;font-family:var(--font-display);color:var(--gold)">${avgRating}</div>
              <div>
                <div style="color:var(--gold)">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5-Math.round(avgRating))}</div>
                <div style="font-size:.72rem;color:var(--muted)">${p.review_count||reviews.length} verified reviews</div>
              </div>
            </div>
            <div class="reviews-list">
              ${reviews.map(r => `<div class="review-item">
                <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                <div><span class="review-author">${escapeHtml(r.author)}</span><span class="review-date">${escapeHtml(r.date)}</span></div>
                <div class="review-text">${escapeHtml(r.text)}</div>
              </div>`).join('')}
            </div>
          ` : '<div style="color:var(--muted);font-size:.8rem;margin-bottom:1rem">No reviews yet. Be the first to review this product!</div>'}
          <!-- WRITE A REVIEW -->
          <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:1rem;margin-top:1rem">
            <div style="font-size:.78rem;font-weight:700;margin-bottom:.75rem;color:var(--ivory2)">Write a Review</div>
            <div style="display:flex;gap:.3rem;margin-bottom:.6rem" id="starPicker">
              ${[1,2,3,4,5].map(n=>`<button onclick="setReviewStar(${n})" data-star="${n}" style="font-size:1.1rem;background:none;border:none;color:var(--muted);cursor:pointer;transition:color var(--t)" onmouseover="hoverStar(${n})" onmouseout="unhoverStar()">★</button>`).join('')}
            </div>
            <input class="form-control" placeholder="Your name" id="rev-name" style="margin-bottom:.4rem;font-size:.78rem">
            <textarea class="form-control" rows="2" placeholder="Share your experience…" id="rev-text" style="resize:none;font-size:.78rem;margin-bottom:.5rem"></textarea>
            <button class="btn btn-gold btn-sm" onclick="submitReview(${p.id})">Submit Review</button>
          </div>
        </div>
        <div id="mship" class="m-tab-body hidden">
          <strong style="color:var(--ivory2)">Within Ethiopia:</strong> Addis Ababa 1–2 days (Br 400). Regions 3–6 days (Br 600–800).<br><br>
          <strong style="color:var(--ivory2)">International Express:</strong> 5–10 business days ($25).<br>
          <strong style="color:var(--ivory2)">International Standard:</strong> 10–21 days ($15).<br><br>
          Free shipping on orders above Br 15,000 within Ethiopia.
        </div>
      </div>
    </div>
    <!-- RELATED PRODUCTS -->
    <div style="padding:1.5rem;border-top:1px solid var(--border)">
      <div class="t-label" style="margin-bottom:1rem">You Might Also Like</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem">
        ${PRODUCTS.filter(q => q.id !== id && q.gender === p.gender).slice(0,4).map(q => `
          <div onclick="closeModal();setTimeout(()=>openModal(${q.id}),100)" style="cursor:pointer">
            <div style="aspect-ratio:3/4;overflow:hidden;border-radius:var(--r);background:var(--ink2);margin-bottom:.4rem">
              <img src="${q.images[0]}" alt="${q.name}" style="width:100%;height:100%;object-fit:cover;transition:transform .4s" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            </div>
            <div style="font-size:.72rem;font-weight:600;color:var(--ivory2)">${q.name}</div>
            <div style="font-size:.68rem;color:var(--gold)">Br ${q.price.toLocaleString()}</div>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('productModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
}

function handleZoom(e, el) {
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1) + '%';
  const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1) + '%';
  el.style.setProperty('--mx', x);
  el.style.setProperty('--my', y);
}

function switchImg(src, btn) {
  document.getElementById('mainImg').src = src;
  document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

function selectSize(s, btn) {
  S.selectedSize = s;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectColor(c, btn) {
  S.selectedColor = c;
  document.querySelectorAll('.cpick').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const nameEl = document.getElementById('selColorName');
  if (nameEl) nameEl.textContent = COLOR_NAMES[c] || c;
}

function chModalQty(d) {
  S.selectedQty = Math.max(1, S.selectedQty + d);
  document.getElementById('mqty').textContent = S.selectedQty;
  if (S.modalProduct) document.getElementById('msubtotal').textContent = `Br ${(S.modalProduct.price * S.selectedQty).toLocaleString()}`;
}

function switchMTab(btn, id) {
  document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['mdesc','mmat','mrev','mship'].forEach(i => document.getElementById(i)?.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('productModal').classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
  renderRecentlyViewed();
}

// ── SIZE GUIDE TABS ──
function showSizeTab(tab, btn) {
  document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['women','men','kids'].forEach(t => document.getElementById('sizeTab'+t.charAt(0).toUpperCase()+t.slice(1))?.classList.add('hidden'));
  document.getElementById('sizeTab'+tab.charAt(0).toUpperCase()+tab.slice(1))?.classList.remove('hidden');
}

// ── PDF DOWNLOAD ──
function downloadPDF(type) {
  const labels = {
    all:'OCF Full Catalog', men:"OCF Men's Catalog", women:"OCF Women's Catalog",
    kids:"OCF Kids' Catalog", 'size-guide':'OCF Size Guide'
  };
  const label = labels[type] || 'OCF Product Brochure';
  toast(`📄 Generating "${label}"…`);
  setTimeout(() => {
    // Generate a simple text-based PDF simulation
    const content = generatePDFContent(type);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = label.replace(/\s/g,'-') + '.txt';
    a.click(); URL.revokeObjectURL(url);
    toast(`✓ "${label}" downloaded!`, 'success');
  }, 800);
}

function generatePDFContent(type) {
  const lines = [
    'OCF — OROMO CULTURAL FASHION',
    'Arba Minch, Ethiopia | hello@oromoculturalfashion.com | WhatsApp: +251 900 000 000',
    '='.repeat(60), ''
  ];
  let products = PRODUCTS;
  if (type === 'men') { lines.push("MEN'S CATALOG"); products = PRODUCTS.filter(p => p.gender === 'men'); }
  else if (type === 'women') { lines.push("WOMEN'S CATALOG"); products = PRODUCTS.filter(p => p.gender === 'women'); }
  else if (type === 'kids') { lines.push("KIDS' CATALOG"); products = PRODUCTS.filter(p => p.gender === 'kids'); }
  else if (type === 'size-guide') {
    lines.push('SIZE GUIDE', '');
    lines.push("WOMEN'S SIZES: XS(30-32 bust) S(32-34) M(34-36) L(36-38) XL(38-40) XXL(40-42) XXXL(42-44)");
    lines.push("MEN'S SIZES: S(36-38 chest) M(38-40) L(40-42) XL(42-44) XXL(44-46) XXXL(46-48)");
    lines.push("KIDS' SIZES: 2-3yr(92-98cm) 4-5yr(104-110cm) 6-7yr(116-122cm) 8-9yr(128-134cm) 10-12yr(140-152cm) 13-15yr(158-168cm)");
    return lines.join('\n');
  } else { lines.push('FULL PRODUCT CATALOG'); }
  lines.push('');
  products.forEach(p => {
    lines.push(`${p.name}`);
    lines.push(`  Region: ${p.region} | Gender: ${p.gender} | Category: ${p.cat}`);
    lines.push(`  Price: Br ${p.price.toLocaleString()}${p.compare_price?' (Was Br '+p.compare_price.toLocaleString()+')':''}`);
    lines.push(`  Sizes: ${(p.sizes||[]).join(', ')}`);
    lines.push(`  ${p.description}`);
    lines.push('');
  });
  lines.push('='.repeat(60));
  lines.push('Place orders at: WhatsApp +251 900 000 000 or hello@oromoculturalfashion.com');
  return lines.join('\n');
}

// ── CART SYNC (loads server cart into S.cart) ──
async function loadUserCart() {
  if (!S.token || S.token === 'demo') { S.cart = []; updateCartBadge(); renderCartDrawer(); return; }
  try {
    const res = await api('/cart');
    if (res && res.items) {
      S.cart = res.items.map(i => ({
        _cartId: i.id,          // DB row id — required for PUT/DELETE
        id: i.product_id,       // product id — used by UI
        name: i.name,
        price: i.price,
        qty: i.quantity,
        size: i.size,
        image: Array.isArray(i.images) ? i.images[0] : i.images
      }));
    } else {
      S.cart = [];
    }
  } catch { S.cart = []; }
  updateCartBadge(); renderCartDrawer();
}

// ── WISHLIST SYNC (loads server wishlist into S.wishlist as [productId, ...]) ──
async function loadUserWishlist() {
  if (!S.token || S.token === 'demo') { S.wishlist = []; updateCartBadge(); return; }
  try {
    const res = await api('/wishlist');
    if (res && res.items) {
      S.wishlist = res.items.map(i => i.product_id);
    } else {
      S.wishlist = [];
    }
  } catch { S.wishlist = []; }
  updateCartBadge();
  // Re-render wishlist page if open
  if (S.page === 'wishlist') renderWishlist();
}

// ── QUICK ADD ──
async function quickAddToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p || p.stock === 0) { toast('Out of stock', 'error'); return; }
  await addToCart({ id: p.id, name: p.name, price: p.price, size: p.sizes?.[1]||p.sizes?.[0]||'M', color: p.colors?.[0]||'', image: Array.isArray(p.images) ? p.images[0] : p.images });
}

function bundleToCart(name, price) {
  if (!S.token || S.token === 'demo') { toast('Please sign in to add items to your cart 👤', 'error'); openAuth(); return; }
  toast(`"${name}" added to cart ✓`, 'success');
  updateCartBadge();
}

// ── CART ──
async function addToCart(item) {
  if (!S.token || S.token === 'demo') {
    toast('Please sign in to add items to your cart 👤', 'error');
    openAuth();
    return;
  }
  try {
    const res = await api('/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: item.id, quantity: item.qty || 1, size: item.size || 'M' })
    });
    if (res && !res.error) {
      toast(`"${item.name}" added to cart ✓`, 'success');
      await loadUserCart();
    } else {
      toast(res?.error || 'Could not add to cart. Please try again.', 'error');
    }
  } catch {
    toast('Network error. Please try again.', 'error');
  }
}

async function removeFromCart(productId, size) {
  const item = S.cart.find(i => i.id === productId && i.size === size);
  if (!item) return;
  const cartRowId = item._cartId;
  if (!cartRowId) { S.cart = S.cart.filter(i => !(i.id===productId && i.size===size)); updateCartBadge(); renderCartDrawer(); return; }
  try {
    await api('/cart/' + cartRowId, { method: 'DELETE' });
    await loadUserCart();
  } catch {
    toast('Could not remove item. Please try again.', 'error');
  }
}

async function changeQty(productId, size, delta) {
  const item = S.cart.find(i => i.id === productId && i.size === size);
  if (!item) return;
  const newQty = Math.max(1, (item.qty || 1) + delta);
  const cartRowId = item._cartId;
  if (!cartRowId) { item.qty = newQty; updateCartBadge(); renderCartDrawer(); return; }
  try {
    await api('/cart/' + cartRowId, {
      method: 'PUT',
      body: JSON.stringify({ quantity: newQty })
    });
    await loadUserCart();
  } catch {
    toast('Could not update quantity. Please try again.', 'error');
  }
}

function cartTotal() { return S.cart.reduce((s,i) => s + i.price*(i.qty||1), 0); }
function cartCount() { return S.cart.reduce((s,i) => s + (i.qty||1), 0); }

function updateCartBadge() {
  const n = cartCount();
  const b = document.getElementById('cartCount');
  if (b) { b.textContent = n; b.style.display = n ? 'flex' : 'none'; }
  const w = document.getElementById('wishBtn');
  if (w) w.textContent = S.wishlist.length ? '❤️' : '♡';
  updateCompareBar();
}

function renderCartDrawer() {
  const body = document.getElementById('drawerBody');
  const foot = document.getElementById('drawerFoot');
  const cnt = document.getElementById('drawerCount');
  if (!body) return;
  const count = cartCount();
  if (cnt) cnt.textContent = count ? `(${count} item${count>1?'s':''})` : '';
  if (!S.cart.length) {
    body.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div><div>Your cart is empty</div><button class="btn btn-outline btn-sm" style="margin-top:1rem" onclick="closeCart();go('products')">Start Shopping</button></div>`;
    if (foot) foot.innerHTML = '';
    return;
  }
  body.innerHTML = S.cart.map(item => {
    const img = typeof item.image === 'string' ? item.image : (item.images?.[0]||'');
    return `<div class="cart-item">
      <div class="ci-img"><img src="${img}" alt="${item.name}"></div>
      <div style="flex:1">
        <div class="ci-name">${item.name}</div>
        <div class="ci-meta">Size: ${item.size}${item.color?` · <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};vertical-align:middle"></span>`:''}
        </div>
        <div class="ci-row">
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeQty(${item.id},'${item.size}',-1)">−</button>
            <span class="qty-val">${item.qty||1}</span>
            <button class="qty-btn" onclick="changeQty(${item.id},'${item.size}',1)">+</button>
          </div>
          <div class="ci-price">Br ${(item.price*(item.qty||1)).toLocaleString()}</div>
        </div>
        <button class="ci-remove" onclick="removeFromCart(${item.id},'${item.size}')">Remove</button>
      </div>
    </div>`;
  }).join('');
  const sub = cartTotal();
  const ship = sub >= 15000 ? 0 : 800;
  if (foot) foot.innerHTML = `
    <div class="cart-line"><span>Subtotal</span><span>Br ${sub.toLocaleString()}</span></div>
    <div class="cart-line"><span>Shipping</span><span>${ship===0?'<span style="color:var(--green-light)">Free</span>':'Br '+ship.toLocaleString()}</span></div>
    <div class="cart-line total"><span>Total</span><span style="color:var(--gold)">Br ${(sub+ship).toLocaleString()}</span></div>
    <button class="btn btn-gold btn-block" style="margin-top:1rem" onclick="closeCart();go('checkout')">Proceed to Checkout →</button>
    <div class="cart-security">🔒 SSL Secured · Free 30-day returns</div>`;
}

function openCart() { document.getElementById('cartDrawer').classList.add('open'); document.getElementById('overlay').classList.add('show'); renderCartDrawer(); }
function closeCart() { document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

// ── WISHLIST ──
async function toggleWish(id, btn) {
  if (!S.token || S.token === 'demo') {
    toast('Please sign in to save items to your wishlist 👤', 'error');
    openAuth();
    return;
  }
  if (btn) { btn.disabled = true; }
  try {
    const res = await api('/wishlist/' + id, { method: 'POST' });
    if (res && typeof res.wishlisted === 'boolean') {
      if (res.wishlisted) {
        if (!S.wishlist.includes(id)) S.wishlist.push(id);
        toast('Added to wishlist ♡', 'success');
      } else {
        S.wishlist = S.wishlist.filter(x => x !== id);
        toast('Removed from wishlist');
      }
    } else {
      toast(res?.error || 'Could not update wishlist.', 'error');
    }
  } catch {
    toast('Network error. Please try again.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
  document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => { b.textContent = S.wishlist.includes(id) ? '❤️' : '♡'; b.classList.toggle('active', S.wishlist.includes(id)); });
  updateCartBadge();
  if (S.page === 'wishlist') renderWishlist();
}

function renderWishlist() {
  const el = document.getElementById('wishlistGrid');
  if (!el) return;
  const items = PRODUCTS.filter(p => S.wishlist.includes(p.id));
  if (!items.length) {
    el.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--muted)"><div style="font-size:2.5rem;opacity:.35;margin-bottom:.75rem">♡</div><div>Your wishlist is empty.</div><button class="btn btn-gold" style="margin-top:1.25rem" onclick="go(\'products\')">Explore Products</button></div>';
    return;
  }
  el.innerHTML = items.map(productCard).join('');
}

// ── COLLECTIONS ──
function renderCollections() {
  const el = document.getElementById('collectionsGrid');
  if (!el) return;
  el.innerHTML = COLLECTIONS_DATA.map(c => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);overflow:hidden;display:grid;grid-template-columns:220px 1fr;transition:border-color var(--t)" onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="overflow:hidden"><img src="${c.img}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover;filter:brightness(.65)" loading="lazy"></div>
      <div style="padding:2rem">
        <div class="t-eyebrow" style="margin-bottom:.35rem">${c.region}</div>
        <div class="t-display-sm" style="margin-bottom:.5rem">${c.name}</div>
        <div class="divider-line"></div>
        <p class="t-body" style="font-size:.8rem;margin-bottom:1.25rem">${c.desc}</p>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:.75rem;color:var(--muted)">${c.pieces} handcrafted pieces</span>
          <button class="btn btn-outline btn-sm" onclick="go('products')">Shop Collection →</button>
        </div>
      </div>
    </div>`).join('');
}

// ── BUNDLES ──
function renderBundlesPage() {
  const el = document.getElementById('bundlesPageGrid');
  if (!el) return;
  el.innerHTML = LOCAL_BUNDLES.map(b => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);overflow:hidden;margin-bottom:1.5rem;transition:border-color var(--t)" onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
      ${b.featured ? '<div style="background:var(--gold);color:var(--black);font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:.35rem">⭐ Most Popular Bundle</div>' : ''}
      <div style="display:grid;grid-template-columns:260px 1fr">
        <div style="background:var(--ink2);display:flex;align-items:center;justify-content:center;flex-direction:column;padding:2rem;text-align:center">
          <div style="font-size:3.5rem;margin-bottom:1rem">${b.icon}</div>
          <div style="font-size:1.5rem;font-weight:700">Br ${b.price.toLocaleString()}</div>
          <div style="font-size:.82rem;color:var(--muted);text-decoration:line-through;margin-top:.2rem">Br ${b.compare_price.toLocaleString()}</div>
          <div style="margin-top:.5rem"><span class="badge badge-gold">Save ${b.save_pct}%</span></div>
        </div>
        <div style="padding:2.25rem">
          <div class="t-eyebrow" style="margin-bottom:.35rem">Bundle Deal</div>
          <div class="t-display-sm" style="margin-bottom:.5rem">${b.name}</div>
          <div class="divider-line"></div>
          <p class="t-body" style="margin-bottom:1.25rem">${b.desc}</p>
          <div style="font-size:.78rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">What's Included:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-bottom:1.5rem">
            ${b.items.map(i=>`<div style="font-size:.78rem;color:rgba(240,235,224,.65);display:flex;align-items:start;gap:.4rem"><span style="color:var(--gold);flex-shrink:0">✓</span>${i}</div>`).join('')}
          </div>
          <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
            <button class="btn btn-gold btn-lg" onclick="bundleToCart('${b.name}',${b.price})">Add Bundle — Br ${b.price.toLocaleString()}</button>
            <button class="btn btn-ghost btn-sm" onclick="go('contact')">Customize Order</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

// ── FAQ ──
function renderFAQ() {
  const el = document.getElementById('faqContainer');
  if (!el) return;
  el.innerHTML = FAQS.map(([q,a],i) => `
    <div class="faq-item" id="faq${i}">
      <button class="faq-q" onclick="toggleFAQ(${i})">${q}<span class="faq-icon">+</span></button>
      <div class="faq-a">${a}</div>
    </div>`).join('');
}

function toggleFAQ(i) {
  const el = document.getElementById('faq'+i);
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(x => x.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
}

// ── AUTH ──
function openAuth() { document.getElementById('authModal').classList.add('show'); document.getElementById('overlay').classList.add('show'); updateAuthUI(); }
function closeAuth() { document.getElementById('authModal').classList.remove('show'); document.getElementById('overlay').classList.remove('show'); }
function switchAuthTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}
function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  if (btn) btn.textContent = S.user ? '👤✓' : '👤';
  // Show admin nav links only for admin users
  const adminNavBtn = document.getElementById('nl-admin');
  const adminMLink  = document.getElementById('m-admin-link');
  const isAdmin = S.user?.role === 'admin';
  if (adminNavBtn) adminNavBtn.style.display = isAdmin ? '' : 'none';
  if (adminMLink)  adminMLink.style.display  = isAdmin ? '' : 'none';
}
async function handleLogin() {
  const email = document.getElementById('l-email').value;
  const pass = document.getElementById('l-pass').value;
  if (!email||!pass) { toast('Please fill in all fields', 'error'); return; }
  
  const btn = event.target;
  const oldText = btn.innerText;
  btn.innerText = 'Signing In...';
  btn.disabled = true;

  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });

    if (res && res.token) {
      S.token = res.token;
      S.user = res.user;
      saveAuth();
      toast(`Welcome back, ${res.user.name || 'User'}! ✓`, 'success');
      closeAuth(); 
      updateAuthUI();
      // Load the user's real cart and wishlist from the server
      await loadUserCart();
      await loadUserWishlist();
      if (S.page === 'account') initAccountPage();
    } else {
      toast(res?.error || 'Login failed. Please check your credentials.', 'error');
    }
  } catch (err) {
    toast('A network error occurred. Please try again.', 'error');
  } finally {
    btn.innerText = oldText;
    btn.disabled = false;
  }
}
async function handleRegister() {
  const name = document.getElementById('r-name').value;
  const email = document.getElementById('r-email').value;
  const pass = document.getElementById('r-pass').value;
  if (!name||!email||!pass) { toast('Please fill in all fields', 'error'); return; }
  if (pass.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
  
  const btn = event.target;
  const oldText = btn.innerText;
  btn.innerText = 'Creating Account...';
  btn.disabled = true;

  try {
    const res = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass })
    });

    if (res && res.token) {
      S.token = res.token;
      S.user = res.user;
      saveAuth();
      toast(`Welcome, ${name}! 🌿`, 'success');
      closeAuth(); 
      updateAuthUI();
      await loadUserCart();
      await loadUserWishlist();
    } else {
      toast(res?.error || 'Registration failed. Please try a different email.', 'error');
    }
  } catch (err) {
    toast('A network error occurred. Please try again.', 'error');
  } finally {
    btn.innerText = oldText;
    btn.disabled = false;
  }
}

// ── CHECKOUT ──
function renderCheckout() {
  const el = document.getElementById('checkoutContent');
  if (!el) return;
  updateCheckoutSteps();
  const sub = cartTotal();
  const ship = sub >= 15000 ? 0 : 800;
  const total = sub + ship;
  const summary = `<div class="order-summary-box">
    <div class="t-display-sm" style="margin-bottom:1.1rem">Order Summary</div>
    ${S.cart.map(i=>`<div style="display:flex;justify-content:space-between;font-size:.8rem;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.04)"><span>${i.name} ×${i.qty||1}</span><span>Br ${(i.price*(i.qty||1)).toLocaleString()}</span></div>`).join('')}
    <div class="cart-line" style="margin-top:.5rem"><span>Subtotal</span><span>Br ${sub.toLocaleString()}</span></div>
    <div class="cart-line"><span>Shipping</span><span>${ship===0?'<span style="color:var(--green-light)">Free</span>':'Br '+ship.toLocaleString()}</span></div>
    <div class="cart-line total"><span>Total</span><span style="color:var(--gold)">Br ${total.toLocaleString()}</span></div>
    <div style="font-size:.68rem;color:var(--muted);margin-top:.5rem">🔒 SSL secured checkout</div>
  </div>`;
  let main = '';
  if (S.checkoutStep === 1) {
    main = `<div><h2 class="t-display-sm" style="margin-bottom:1.5rem">Review Your Cart</h2>
      ${!S.cart.length ? `<div style="color:var(--muted)">Cart is empty. <button onclick="go('products')" style="background:none;border:none;color:var(--gold);cursor:pointer">Shop →</button></div>` :
      S.cart.map(i=>`<div style="display:flex;gap:1rem;padding:1rem 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <div style="width:60px;height:78px;border-radius:var(--r);overflow:hidden;flex-shrink:0"><img src="${i.image||''}" style="width:100%;height:100%;object-fit:cover"></div>
        <div style="flex:1">
          <div style="font-size:.9rem;font-weight:600">${i.name}</div>
          <div style="font-size:.72rem;color:var(--muted)">Size: ${i.size}</div>
          <div style="display:flex;justify-content:space-between;margin-top:.5rem">
            <div class="qty-ctrl"><button class="qty-btn" onclick="changeQty(${i.id},'${i.size}',-1);renderCheckout()">−</button><span class="qty-val">${i.qty||1}</span><button class="qty-btn" onclick="changeQty(${i.id},'${i.size}',1);renderCheckout()">+</button></div>
            <div style="font-weight:700">Br ${(i.price*(i.qty||1)).toLocaleString()}</div>
          </div>
        </div>
      </div>`).join('')}
      ${S.cart.length ? `<button class="btn btn-gold" style="margin-top:1.5rem" onclick="goStep(2)">Continue to Shipping →</button>` : ''}
    </div>`;
  } else if (S.checkoutStep === 2) {
    main = `<div><h2 class="t-display-sm" style="margin-bottom:1.5rem">Shipping Information</h2>
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name *</label><input class="form-control" placeholder="Liya" id="s-fn"></div>
        <div class="form-group"><label class="form-label">Last Name *</label><input class="form-control" placeholder="Hunduma" id="s-ln"></div>
      </div>
      <div class="form-group"><label class="form-label">Email *</label><input class="form-control" type="email" placeholder="your@email.com" id="s-em"></div>
      <div class="form-group"><label class="form-label">Phone / WhatsApp *</label><input class="form-control" placeholder="+1 555 000 0000" id="s-ph"></div>
      <div class="form-group"><label class="form-label">Street Address *</label><input class="form-control" placeholder="123 Main Street" id="s-ad"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">City *</label><input class="form-control" id="s-ci"></div>
        <div class="form-group"><label class="form-label">Country</label>
          <select class="form-control" id="s-co"><option>Ethiopia</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option><option>Germany</option><option>Other</option></select>
        </div>
      </div>
      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <button class="btn btn-ghost" onclick="goStep(1)">← Back</button>
        <button class="btn btn-gold" onclick="validateShipping()">Continue to Payment →</button>
      </div>
    </div>`;
  } else if (S.checkoutStep === 3) {
    main = `<div><h2 class="t-display-sm" style="margin-bottom:1.5rem">Payment Method</h2>
      <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1.75rem">
        ${[['chapa','Chapa','Telebirr · CBE Birr · Bank Cards','🇪🇹'],['paypal','PayPal','Pay with PayPal','💙'],['card','Visa / Mastercard','Secure card payment','💳'],['bank','Bank Transfer','Direct bank payment','🏦']].map(([v,n,s,i])=>`<label style="display:flex;align-items:center;gap:1rem;padding:1rem;border:1px solid var(--border);border-radius:var(--r2);cursor:pointer;transition:border-color var(--t)"><input type="radio" name="pay" value="${v}" style="accent-color:var(--gold)"><span style="font-size:1.1rem">${i}</span><div><div style="font-size:.88rem;font-weight:600">${n}</div><div style="font-size:.72rem;color:var(--muted)">${s}</div></div></label>`).join('')}
      </div>
      <div class="form-group"><label class="form-label">Promo Code</label><div style="display:flex;gap:.5rem"><input class="form-control" placeholder="Enter code" id="promoInput" style="max-width:220px"><button class="btn btn-ghost btn-sm" onclick="applyPromo()">Apply</button></div></div>
      <div style="display:flex;gap:.75rem;margin-top:1.25rem">
        <button class="btn btn-ghost" onclick="goStep(2)">← Back</button>
        <button class="btn btn-gold btn-lg" onclick="placeOrder()">Place Order — Br ${total.toLocaleString()} →</button>
      </div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:.75rem;text-align:center">🔒 Your payment is encrypted and secure</div>
    </div>`;
  } else if (S.checkoutStep === 4) {
    const orderNum = S.lastOrderNum || `OCF-${Date.now().toString(36).toUpperCase()}`;
    el.innerHTML = `<div style="max-width:600px;margin:0 auto;text-align:center;padding:3rem 1rem">
      <div style="font-size:4rem;margin-bottom:1rem">✅</div>
      <h2 style="font-family:var(--font-display);font-size:2rem;color:var(--gold);margin-bottom:.75rem">Order Confirmed!</h2>
      <p class="t-body" style="margin-bottom:.5rem">Thank you for supporting Oromo craftsmanship.</p>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:2rem">Order <strong style="color:var(--gold)">#${orderNum}</strong> · Confirmation sent to your email and WhatsApp.</p>
      <button class="btn btn-gold btn-lg" onclick="S.cart=[];updateCartBadge();renderCartDrawer();go('home')">Continue Shopping →</button>
    </div>`;
    updateCheckoutSteps();
    return;
  }
  el.innerHTML = `<div class="checkout-grid">${main}${summary}</div>`;
  updateCheckoutSteps();
}

function goStep(n) { S.checkoutStep = n; renderCheckout(); window.scrollTo({top:0,behavior:'smooth'}); }
function updateCheckoutSteps() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('cs'+i);
    if (!el) continue;
    el.classList.remove('active','done');
    if (i === S.checkoutStep) el.classList.add('active');
    else if (i < S.checkoutStep) el.classList.add('done');
  }
}
function validateShipping() {
  const fields = ['s-fn','s-ln','s-em','s-ph','s-ad','s-ci'];
  for (const id of fields) { if (!document.getElementById(id)?.value) { toast('Please fill in all required fields', 'error'); return; } }
  
  S.shipping = {
    name: document.getElementById('s-fn').value + ' ' + document.getElementById('s-ln').value,
    email: document.getElementById('s-em').value,
    phone: document.getElementById('s-ph').value,
    address: document.getElementById('s-ad').value,
    city: document.getElementById('s-ci').value,
    country: document.getElementById('s-co')?.value || 'Ethiopia'
  };
  goStep(3);
}
function applyPromo() {
  const code = document.getElementById('promoInput')?.value?.toUpperCase();
  const codes = { WELCOME10:'10% discount applied', BUNDLE15:'15% discount applied', WEDDING20:'20% wedding discount applied' };
  if (codes[code]) toast(`✓ ${codes[code]}!`, 'success');
  else toast('Invalid promo code', 'error');
}
async function placeOrder() {
  const method = document.querySelector('input[name="pay"]:checked');
  if (!method) { toast('Please select a payment method', 'error'); return; }
  toast('Processing your order…');
  
  const promo = document.getElementById('promoInput')?.value;
  
  try {
    const payload = {
      items: S.cart.map(i => ({ product_id: i.id, quantity: i.qty || 1, size: i.size || 'M' })),
      shipping: S.shipping || { name: 'Guest', email: 'guest@example.com', address: 'Unknown', city: 'Unknown', phone: '000' },
      payment_method: method.value,
      promo_code: promo || null
    };
    
    const res = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    if (res.error) throw new Error(res.error);
    
    S.lastOrderNum = res.orderNumber;
    goStep(4);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── SEARCH ──
function doSearch(q) {
  if (!q || q.length < 2) { hideDrop(); return; }
  const products = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.region.toLowerCase().includes(q.toLowerCase()) ||
    p.cat.toLowerCase().includes(q.toLowerCase()) ||
    p.gender.toLowerCase().includes(q.toLowerCase())
  );
  const drop = document.getElementById('searchDrop');
  if (!products.length) { drop.innerHTML = `<div style="color:var(--muted);font-size:.84rem;padding:.5rem">No results for "${q}"</div>`; }
  else { drop.innerHTML = products.slice(0,6).map(p => {
    const sImg = typeof getMediaUrl === 'function' ? getMediaUrl(p.images?.[0] || '') : (p.images?.[0] || '');
    return `<div class="sr-item" onclick="openModal(${p.id});hideDrop()"><div class="sr-thumb"><img src="${escapeHtml(sImg)}" alt="${escapeHtml(p.name)}"></div><div><div class="sr-name">${escapeHtml(p.name)}</div><div style="font-size:.62rem;color:var(--muted)">${escapeHtml(p.gender)} · ${escapeHtml(p.cat)}</div><div class="sr-price">Br ${(p.price||0).toLocaleString()}</div></div></div>`;
  }).join(''); }
  showDrop();
}
function showDrop() { document.getElementById('searchDrop').classList.add('show'); }
function hideDrop() { document.getElementById('searchDrop').classList.remove('show'); }

// ── CONTACT ──
async function submitContact() {
  const name = document.getElementById('c-name')?.value;
  const email = document.getElementById('c-email')?.value;
  const msg = document.getElementById('c-msg')?.value;
  if (!name||!email||!msg) { toast('Please fill in all required fields', 'error'); return; }
  toast("Message sent! We'll respond within 24 hours. ✓", 'success');
  ['c-name','c-email','c-phone','c-msg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ── NEWSLETTER ──
async function subscribeNL() {
  const email = document.getElementById('nlEmail')?.value;
  if (!email||!email.includes('@')) { toast('Please enter a valid email address', 'error'); return; }
  toast('Subscribed! Check your email for your 10% welcome discount. 🌿', 'success');
  if (document.getElementById('nlEmail')) document.getElementById('nlEmail').value = '';
}

// ── MOBILE MENU ──
function openMMenu() { document.getElementById('mMenu').classList.add('open'); document.getElementById('overlay').classList.add('show'); }
function closeMMenu() { document.getElementById('mMenu').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }
function closeAll() { closeCart(); closeModal(); closeAuth(); closeMMenu(); closeCompareModal(); document.getElementById('overlay').classList.remove('show'); hideDrop(); }

// ── TOAST ──
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast'+(type?' '+type:'');
  t.textContent = msg;
  document.getElementById('toastWrap').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3200);
}

// ── COUNTDOWN ──
(function() {
  const end = Date.now() + (6*864e5 + 14*36e5 + 32*6e4 + 8e3);
  function tick() {
    const d = end - Date.now();
    if (d < 0) return;
    const f = n => String(Math.floor(n)).padStart(2,'0');
    const els = {'cd-d':d/864e5,'cd-h':d%864e5/36e5,'cd-m':d%36e5/6e4,'cd-s':d%6e4/1e3};
    Object.entries(els).forEach(([id,v])=>{ const el=document.getElementById(id); if(el) el.textContent=f(v); });
  }
  tick(); setInterval(tick, 1000);
})();

// ── SCROLL ──
window.addEventListener('scroll', () => {
  document.getElementById('scrollTopBtn')?.classList.toggle('vis', window.scrollY > 400);
});

// ── GENDER QUICK FILTER (men/women pages) ──
function filterGenderQuick(gender, filter, btn) {
  // update pill UI
  const container = btn.closest ? btn.closest('div') : null;
  if (container) container.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
  if (btn.classList) btn.classList.add('active');
  const grid = document.getElementById(gender + 'ProductsGrid');
  const count = document.getElementById(gender + 'ProdCount');
  if (!grid) return;
  let products = PRODUCTS.filter(p => p.gender === gender);
  if (filter === 'new') products = products.filter(p => p.badge === 'new');
  else if (filter === 'bestseller') products = products.filter(p => p.badge === 'bestseller');
  else if (filter === 'sale') products = products.filter(p => p.compare_price);
  else if (filter === 'oromo') products = products.filter(p => p.badge === 'oromo');
  else if (filter === 'traditional') products = products.filter(p => p.cat === 'traditional');
  else if (filter === 'wedding') products = products.filter(p => p.cat === 'wedding');
  else if (filter === 'hijab') products = products.filter(p => p.cat === 'hijab');
  if (count) count.textContent = `Showing ${products.length} products`;
  grid.innerHTML = products.map(productCard).join('') || '<div style="color:var(--muted);padding:2rem;text-align:center">No products found.</div>';
}

// ── EXTENDED FAQ DATA ──
const FAQS_EXTENDED = [
  { cat:'sizing', q:"How do I know my size?", a:"Use our Size Guide with your bust, waist, and hip measurements. If between sizes, size up — Oromo garments are designed with generous flow. WhatsApp us your measurements (+251 900 000 000) for personal sizing advice. We also offer custom sizing on all traditional pieces." },
  { cat:'sizing', q:"Do you offer custom sizing?", a:"Yes! All traditional wear and bridal pieces are available in custom measurements at no extra charge. Simply select 'Custom Order' at checkout or WhatsApp us your measurements. For non-traditional pieces, custom sizing may add Br 500–1,000 and 3–5 extra days." },
  { cat:'sizing', q:"How do kids' sizes work?", a:"Kids' clothing is sized by age group: 2–3, 4–5, 6–7, 8–9, 10–12, and 13–15 years. Each corresponds to a height and chest measurement range. View our full Kids' Size Chart in the Size Guide page. If your child is between sizes, order the larger size." },
  { cat:'shipping', q:"Do you ship internationally?", a:"Yes, worldwide shipping to 30+ countries. Express (5–10 business days) for USA, Canada, UK, Australia, Europe at $25. Standard (10–21 days) at $15. Free shipping on orders above Br 15,000 within Ethiopia. DHL, FedEx, and EMS tracking available." },
  { cat:'shipping', q:"How long does shipping take within Ethiopia?", a:"Addis Ababa: 1–2 business days (Br 400). Other regions: 3–6 business days (Br 600–800). Same-day delivery in Addis Ababa available for orders placed before 12 PM (add Br 600)." },
  { cat:'shipping', q:"Can I track my order?", a:"Yes! Once your order ships, you receive a tracking number via SMS and email. You can track on the carrier's website. WhatsApp us your order number for instant status updates." },
  { cat:'returns', q:"Can I return if it doesn't fit?", a:"Yes — 30-day easy returns. Items must be unworn, unwashed, and in original packaging with tags attached. International returns for size-related issues are covered by OCF for exchanges (not refunds). Refunds processed within 5–7 business days." },
  { cat:'returns', q:"What if my item arrives damaged?", a:"If your item arrives damaged or defective, we replace it at no cost. WhatsApp us a photo within 48 hours of delivery and we'll ship a replacement immediately." },
  { cat:'payment', q:"What payment methods do you accept?", a:"Ethiopia: Chapa (Telebirr, CBE Birr, Awash Bank, all local bank cards), Direct Bank Transfer, Cash on Delivery (Addis Ababa only). International: PayPal, Visa, Mastercard, Stripe. All payments are SSL secured." },
  { cat:'payment', q:"Do you offer payment plans / installments?", a:"Yes! For orders above Br 20,000, we offer 2-month installment payment via bank transfer. Contact us on WhatsApp to arrange. Bridal and custom orders require 50% deposit at confirmation." },
  { cat:'custom', q:"Do you do custom orders?", a:"Yes! Custom orders are available for any design in our catalog at your exact measurements. Allow 2–4 weeks for production. Custom orders start at Br 15,000. WhatsApp us with your design preference, measurements, and occasion." },
  { cat:'custom', q:"Can you do bulk or wholesale orders?", a:"Absolutely. We work with cultural organizations, event planners, schools, and diaspora communities on bulk orders of 10+ pieces. Bulk orders receive 15–30% discounts depending on quantity. Contact us for a wholesale quote." },
  { cat:'product', q:"Are products genuinely handmade?", a:"Every piece is handcrafted by our 200+ artisan partners across five Oromo regions. We publish artisan profiles and maintain fair-wage certification. Machine-assisted pieces (like graphic tees and sportswear) are clearly labeled as such." },
  { cat:'product', q:"What are the fabric and dye compositions?", a:"Traditional pieces use 100% handwoven cotton with natural plant-based dyes (indigo, madder root, weld). Modern/fusion pieces use premium cotton-poly blends with machine embroidery. All kids' garments use child-safe, hypoallergenic dyes." },
  { cat:'product', q:"Do you have gift wrapping?", a:"Yes! Gift wrapping is available at checkout for Br 200. Premium gift boxes with OCF tissue paper, a handwritten card, and Oromo proverb booklet available for Br 500. Free gift wrapping on orders above Br 30,000." },
];

// ── FAQ RENDER (extended) ──
function renderFAQ() {
  const el = document.getElementById('faqContainer');
  if (!el) return;
  el._currentFilter = 'all';
  el.innerHTML = FAQS_EXTENDED.map((item, i) => `
    <div class="faq-item" id="faqx${i}" data-cat="${item.cat}">
      <button class="faq-q" onclick="toggleFAQ('x${i}')">${item.q}<span class="faq-icon">+</span></button>
      <div class="faq-a">${item.a}</div>
    </div>`).join('');
}

function filterFAQ(cat, btn) {
  document.querySelectorAll('.f-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.faq-item').forEach(el => {
    el.style.display = (cat === 'all' || el.dataset.cat === cat) ? 'block' : 'none';
  });
}

function toggleFAQ(id) {
  const el = document.getElementById('faq'+id);
  if (!el) return;
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(x => x.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
}

// ── WISHLIST EXTRAS ──
function addAllWishToCart() {
  const items = PRODUCTS.filter(p => S.wishlist.includes(p.id));
  items.forEach(p => quickAddToCart(p.id));
  toast(`${items.length} items added to cart 🛒`, 'success');
}

async function clearWishlist() {
  if (!S.wishlist.length) return;
  // Toggle-off each wishlisted item via the backend
  try {
    await Promise.all(S.wishlist.map(id => api('/wishlist/' + id, { method: 'POST' })));
  } catch { /* best-effort */ }
  S.wishlist = [];
  updateCartBadge(); renderWishlist();
  toast('Wishlist cleared');
}

function renderWishlist() {
  const el = document.getElementById('wishlistGrid');
  const countEl = document.getElementById('wishCount');
  const addAllBtn = document.getElementById('wishAddAllBtn');
  const clearBtn = document.getElementById('wishClearBtn');
  if (!el) return;
  const items = PRODUCTS.filter(p => S.wishlist.includes(p.id));
  if (countEl) countEl.textContent = items.length ? `(${items.length} item${items.length > 1 ? 's' : ''})` : '';
  if (addAllBtn) addAllBtn.style.display = items.length ? 'inline-flex' : 'none';
  if (clearBtn) clearBtn.style.display = items.length ? 'inline-flex' : 'none';
  if (!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:4rem;color:var(--muted);grid-column:1/-1">
      <div style="font-size:3rem;opacity:.2;margin-bottom:1rem">♡</div>
      <div style="font-size:1rem;font-weight:600;color:var(--ivory2);margin-bottom:.5rem">Your wishlist is empty</div>
      <p style="font-size:.82rem;margin-bottom:1.5rem">Save items you love and come back to them anytime.</p>
      <button class="btn btn-gold" onclick="go('products')">Explore Products →</button>
    </div>`;
    return;
  }
  el.innerHTML = items.map(productCard).join('');
}

// ── NOTIFY ME (back in stock) ──
function notifyWhenBack(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  toast(`We'll notify you when "${p?.name}" is back in stock ✓`, 'success');
}

// ── SOCIAL SHARE (product) ──
function shareProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const text = `Check out this beautiful ${p.name} from OCF — Oromo Cultural Fashion! Br ${p.price.toLocaleString()}`;
  if (navigator.share) {
    navigator.share({ title: p.name, text, url: window.location.href }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(window.location.href + '?product=' + id);
    toast('Product link copied to clipboard ✓', 'success');
  }
}

// ── ORDER TRACKING (real backend API with guest verification & XSS protection) ──
async function trackOrder() {
  const num = document.getElementById('trackNum')?.value?.trim();
  const emailInput = document.getElementById('trackEmail')?.value?.trim();
  const result = document.getElementById('trackResult');
  if (!num || !result) return;

  result.innerHTML = '<div style="color:var(--muted);font-size:.8rem;margin-top:.75rem">Searching order…</div>';

  try {
    const emailParam = emailInput ? `?email=${encodeURIComponent(emailInput)}` : '';
    const res = await api(`/orders/${encodeURIComponent(num)}${emailParam}`);

    if (res && res.order) {
      const o = res.order;
      const items = res.items || [];
      result.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:1.25rem;margin-top:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
            <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)">Order ${escapeHtml(o.order_number)}</div>
            <span class="badge ${o.status === 'delivered' ? 'badge-green' : 'badge-gold'}" style="text-transform:capitalize">${escapeHtml(o.status)}</span>
          </div>
          <div style="font-size:.78rem;color:var(--muted);margin-bottom:.75rem">
            Date: ${new Date(o.created_at).toLocaleDateString()} | Total: Br ${parseFloat(o.total).toLocaleString()}
            ${o.tracking_number ? `<br>Tracking Number: <strong>${escapeHtml(o.tracking_number)}</strong>` : ''}
          </div>
          <div style="border-top:1px solid var(--border);padding-top:.75rem;margin-top:.5rem">
            <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem">Items:</div>
            ${items.map(it => `<div style="font-size:.78rem;color:var(--ivory);margin-bottom:.25rem">• ${escapeHtml(it.name)} (Size: ${escapeHtml(it.size || 'M')}, Qty: ${it.quantity})</div>`).join('')}
          </div>
        </div>`;
    } else {
      result.innerHTML = `<div style="color:#e06060;font-size:.8rem;margin-top:.75rem">
        ${escapeHtml(res?.error || 'Order not found or access denied. If tracking as guest, please enter your checkout email.')}
      </div>`;
    }
  } catch (err) {
    result.innerHTML = `<div style="color:#e06060;font-size:.8rem;margin-top:.75rem">Failed to load order tracking. Please try again.</div>`;
  }
}

// ── ADD ORDER TRACKING TO FOOTER (contact page injection) ──
function injectTrackingWidget() {
  const el = document.getElementById('orderTrackWidget');
  if (!el) return;
  el.innerHTML = `
    <h3 class="t-display-sm" style="margin-bottom:1rem">Track Your Order</h3>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap">
      <input class="form-control" style="flex:1;min-width:180px" placeholder="Order number (e.g. OCF-K3X7P9)" id="trackNum">
      <input class="form-control" style="flex:1;min-width:180px" placeholder="Checkout Email (for guests)" id="trackEmail" type="email">
      <button class="btn btn-gold" onclick="trackOrder()">Track →</button>
    </div>
    <div id="trackResult"></div>`;
}

// ── ACCOUNT PAGE ──
function showAcctTab(tab) {
  const el = document.getElementById('acctContent');
  if (!el) return;
  if (tab === 'orders') {
    el.innerHTML = '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:2rem;text-align:center">Loading orders...</div>';
    api('/orders').then(res => {
      const orders = res?.orders || [];
      el.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:2rem">
        <div class="t-label" style="margin-bottom:1rem">My Orders</div>
        ${orders.length ? orders.map(o => `
          <div style="border:1px solid var(--border);border-radius:var(--r2);padding:1rem;margin-bottom:.75rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
            <div><div style="font-size:.82rem;font-weight:600;color:var(--gold)">#${escapeHtml(o.order_number)}</div>
            <div style="font-size:.72rem;color:var(--muted)">${new Date(o.created_at).toLocaleDateString()}</div></div>
            <div style="text-align:right"><div style="font-size:.88rem;font-weight:700">Br ${parseFloat(o.total).toLocaleString()}</div>
            <span class="badge badge-green" style="font-size:.58rem;text-transform:capitalize">${escapeHtml(o.status)}</span></div>
          </div>`).join('') : '<div style="color:var(--muted);font-size:.82rem;padding:1.5rem;text-align:center">No orders yet. <button onclick="go(\'products\')" style="background:none;border:none;color:var(--gold);cursor:pointer">Start shopping →</button></div>'}
      </div>`;
    }).catch(err => {
      el.innerHTML = '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:2rem;color:#e06060;text-align:center">Failed to load orders.</div>';
    });
  } else if (tab === 'wishlist') {
    go('wishlist');
  } else if (tab === 'track') {
    el.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:2rem">
      <div class="t-label" style="margin-bottom:.75rem">Track Your Order</div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <input class="form-control" style="flex:1;min-width:180px" placeholder="Order number e.g. OCF-K3X7P9" id="trackNum">
        <input class="form-control" style="flex:1;min-width:180px" placeholder="Email (if ordered as guest)" id="trackEmail" type="email">
        <button class="btn btn-gold" onclick="trackOrder()">Track →</button>
      </div>
      <div id="trackResult"></div>
    </div>`;
  } else if (tab === 'profile') {
    const u = S.user || {};
    el.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:2rem">
      <div class="t-label" style="margin-bottom:1rem">Profile Information</div>
      <div class="form-group"><label class="form-label">Name</label>
        <input class="form-control" value="${u.name||''}" id="prof-name"></div>
      <div class="form-group"><label class="form-label">Email</label>
        <input class="form-control" type="email" value="${u.email||''}" id="prof-email"></div>
      <div class="form-group"><label class="form-label">Phone / WhatsApp</label>
        <input class="form-control" value="${u.phone||''}" id="prof-phone" placeholder="+251 900 000 000"></div>
      <div class="form-group"><label class="form-label">Default Country</label>
        <select class="form-control" id="prof-country">
          <option>Ethiopia</option><option>United States</option><option>Canada</option>
          <option>United Kingdom</option><option>Australia</option><option>Germany</option>
          <option>Sweden</option><option>Norway</option><option>Other</option>
        </select></div>
      <button class="btn btn-gold" onclick="saveProfile()">Save Changes</button>
    </div>`;
  }
}

function saveProfile() {
  if (!S.user) S.user = {};
  S.user.name = document.getElementById('prof-name')?.value || S.user.name;
  S.user.email = document.getElementById('prof-email')?.value || S.user.email;
  S.user.phone = document.getElementById('prof-phone')?.value || S.user.phone;
  saveAuth(); toast('Profile updated ✓', 'success');
  const nameEl = document.getElementById('acctName');
  if (nameEl) nameEl.textContent = 'Welcome, ' + (S.user.name || 'back');
}

function logoutUser() {
  // Clear local session — do NOT delete the server-side cart/wishlist
  S.user = null; S.token = null;
  S.cart = []; S.wishlist = [];
  localStorage.removeItem('ocf_token');
  localStorage.removeItem('ocf_user');
  updateAuthUI(); updateCartBadge(); renderCartDrawer();
  toast('Signed out. See you soon!');
  go('home');
}

function initAccountPage() {
  const el = document.getElementById('acctName');
  if (el && S.user) el.textContent = 'Welcome, ' + (S.user.name || S.user.email?.split('@')[0] || 'back');
  showAcctTab('orders');
}

// ── REVIEW STAR PICKER ──
let _reviewStar = 5;
function setReviewStar(n) {
  _reviewStar = n;
  document.querySelectorAll('#starPicker button').forEach((b,i) => {
    b.style.color = i < n ? 'var(--gold)' : 'var(--muted)';
  });
}
function hoverStar(n) {
  document.querySelectorAll('#starPicker button').forEach((b,i) => {
    b.style.color = i < n ? 'var(--gold2)' : 'var(--muted)';
  });
}
function unhoverStar() {
  document.querySelectorAll('#starPicker button').forEach((b,i) => {
    b.style.color = i < _reviewStar ? 'var(--gold)' : 'var(--muted)';
  });
}
async function submitReview(productId) {
  const name = document.getElementById('rev-name')?.value?.trim();
  const text = document.getElementById('rev-text')?.value?.trim();
  if (!name || !text) { toast('Please fill in your name and review', 'error'); return; }
  
  try {
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = 'Submitting...';
    btn.disabled = true;
    
    const res = await api('/products/' + productId + '/reviews', {
      method: 'POST',
      body: JSON.stringify({ rating: _reviewStar, title: 'Review', comment: text, guest_name: name })
    });
    
    if (res && !res.error) {
      toast('Thank you for your review! ★', 'success');
      if (document.getElementById('rev-name')) document.getElementById('rev-name').value = '';
      if (document.getElementById('rev-text')) document.getElementById('rev-text').value = '';
      // Refresh modal to show new review
      openModal(productId);
    } else {
      toast(res?.error || 'Failed to submit review', 'error');
    }
  } catch(e) {
    toast('An error occurred. Please try again.', 'error');
  }
}

async function loadOCFData() {
  const overlay = document.createElement('div');
  overlay.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:var(--bg);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text);font-family:var(--font);"><div class="spinner" style="width:40px;height:40px;border:3px solid var(--gold);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:20px;"></div><h2>Loading OCF Platform...</h2><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
  document.body.appendChild(overlay);
  try {
    if (S.token && S.token !== 'demo') {
      const authRes = await api('/auth/me');
      if (authRes && authRes.user) {
        S.user = authRes.user;
        saveAuth();
        // Load the user's persisted cart and wishlist from PostgreSQL
        await loadUserCart();
        await loadUserWishlist();
      } else {
        S.user = null; S.token = null; S.cart = []; S.wishlist = [];
        localStorage.removeItem('ocf_token');
        localStorage.removeItem('ocf_user');
      }
    }
    
    const pRes = await api('/products?limit=200');
    if (pRes && pRes.products) PRODUCTS = pRes.products;
    
    const cRes = await api('/categories');
    if (cRes && cRes.categories) {
      const catHtml = cRes.categories.map(c => `<label class="s-opt"><input type="checkbox" data-filter="cat" data-val="${c.slug}" onchange="applyFilters()"> ${c.name}</label>`).join('');
      const cList = document.getElementById('catFilterList');
      if (cList) cList.innerHTML = catHtml;
    }
  } catch (err) {
    console.error('Failed to load OCF data', err);
    toast('Unable to connect to the server.', 'error');
  } finally {
    overlay.remove();
  }
}

// ── INIT ──
(async function init() {
  await loadOCFData();
  updateCartBadge();
  updateAuthUI();
  updateCompareBar();
  loadHomeProducts();
  loadHomeBundles();
  injectTrackingWidget();
})();