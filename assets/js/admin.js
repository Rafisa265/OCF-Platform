/* ═══════════════════════════════════════════════════════════
   OCF Admin Dashboard — admin.js
   Requires: api.js loaded before this file (API + S.token)
═══════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

const ADM = {
  tab: 'overview',       // current sidebar tab
  products: [],
  orders: [],
  categories: [],
  editingProduct: null,  // product id being edited (or null for create)
};

// ── Routing ──────────────────────────────────────────────
function goAdmin(tab) {
  // Guard: must be logged-in admin
  if (!S.user || S.user.role !== 'admin') {
    renderAdminDenied();
    return;
  }
  ADM.tab = tab;
  // update sidebar buttons
  document.querySelectorAll('.adm-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const main = document.getElementById('adm-main');
  if (!main) return;
  if (tab === 'overview')  admRenderOverview(main);
  if (tab === 'orders')    admRenderOrders(main);
  if (tab === 'products')  admRenderProducts(main);
  if (tab === 'categories') admRenderCategories(main);
  if (tab === 'users')     admRenderUsers(main);
}

function renderAdminDenied() {
  const el = document.getElementById('adm-main');
  if (!el) return;
  el.innerHTML = `<div class="adm-denied">
    <div style="font-size:3rem">🚫</div>
    <div style="font-size:1.2rem;color:var(--ivory);font-weight:600">Access Denied</div>
    <div style="color:var(--muted);font-size:.82rem">You need admin privileges to view this page.</div>
    <button class="adm-btn adm-btn-ghost" onclick="go('home')">← Back to Store</button>
  </div>`;
}

// ── initAdmin — called by go('admin') ───────────────────
function initAdmin() {
  if (!S.user || S.user.role !== 'admin') {
    renderAdminDenied();
    return;
  }
  goAdmin('overview');
}

// ═════════════════════════════════════════════════════════
// OVERVIEW
// ═════════════════════════════════════════════════════════
async function admRenderOverview(el) {
  el.innerHTML = `
    <div class="adm-header">
      <div class="adm-title">Dashboard Overview</div>
      <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="goAdmin('overview')">↻ Refresh</button>
    </div>
    <div class="adm-stats" id="adm-stats">
      ${[1,2,3,4,5,6].map(()=>`<div class="adm-stat"><div class="adm-skel" style="height:12px;width:60%;margin-bottom:.6rem"></div><div class="adm-skel" style="height:32px;width:80%"></div></div>`).join('')}
    </div>
    <div class="adm-card">
      <div class="adm-card-title">Recent Orders</div>
      <div id="adm-recent-orders"><div class="adm-skel" style="height:120px"></div></div>
    </div>
    <div class="adm-card">
      <div class="adm-card-title">⚠ Low Stock Products</div>
      <div id="adm-low-stock"><div class="adm-skel" style="height:80px"></div></div>
    </div>`;

  const res = await api('/admin/dashboard');
  if (!res || res.error) {
    document.getElementById('adm-stats').innerHTML = `<div class="adm-error" style="grid-column:1/-1">Failed to load dashboard: ${esc(res?.error || 'Network error')}</div>`;
    return;
  }
  const s = res.stats;

  document.getElementById('adm-stats').innerHTML = [
    { label: 'Total Revenue',   value: `Br ${Math.round(s.totalRevenue).toLocaleString()}`, gold: true },
    { label: 'Total Orders',    value: s.totalOrders },
    { label: 'Pending Orders',  value: s.pendingOrders, gold: s.pendingOrders > 0 },
    { label: 'Total Products',  value: s.totalProducts },
    { label: 'Total Users',     value: s.totalUsers },
    { label: 'Total Reviews',   value: s.totalReviews },
    { label: 'Unread Messages', value: s.unreadMessages, gold: s.unreadMessages > 0 },
    { label: 'Newsletter Subs', value: s.newsletterCount },
  ].map(st => `
    <div class="adm-stat">
      <div class="adm-stat-label">${st.label}</div>
      <div class="adm-stat-value${st.gold?' gold':''}">${st.value}</div>
    </div>`).join('');

  // Recent orders mini-table
  document.getElementById('adm-recent-orders').innerHTML = s.recentOrders?.length ? `
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Order #</th><th>Email</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${s.recentOrders.map(o => `
        <tr>
          <td style="color:var(--gold);font-weight:600">${esc(o.order_number)}</td>
          <td>${esc(o.guest_email || o.shipping_email || '—')}</td>
          <td>Br ${parseFloat(o.total).toLocaleString()}</td>
          <td><span class="adm-badge ${esc(o.status)}">${esc(o.status)}</span></td>
          <td style="color:var(--muted)">${new Date(o.created_at).toLocaleDateString()}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : `<div class="adm-empty"><div class="adm-empty-icon">📦</div>No orders yet.</div>`;

  // Low stock
  document.getElementById('adm-low-stock').innerHTML = s.lowStockProducts?.length ? `
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Product</th><th>SKU</th><th>Stock</th></tr></thead>
      <tbody>${s.lowStockProducts.map(p => `
        <tr>
          <td>${esc(p.name)}</td>
          <td style="color:var(--muted)">${esc(p.sku || '—')}</td>
          <td><span class="adm-low-stock">⚠ ${p.stock} left</span></td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : `<div style="color:var(--muted);font-size:.8rem">All products have healthy stock levels. 🎉</div>`;
}

// ═════════════════════════════════════════════════════════
// ORDERS
// ═════════════════════════════════════════════════════════
async function admRenderOrders(el) {
  el.innerHTML = `
    <div class="adm-header">
      <div class="adm-title">Orders Management</div>
      <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="goAdmin('orders')">↻ Refresh</button>
    </div>
    <div class="adm-tabs">
      ${['all','pending','processing','shipped','delivered','cancelled'].map(s =>
        `<button class="adm-tab${s==='all'?' active':''}" onclick="admFilterOrders('${s}',this)">${s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}</button>`
      ).join('')}
    </div>
    <div class="adm-card">
      <div id="adm-orders-body"><div class="adm-skel" style="height:200px"></div></div>
    </div>`;

  await admLoadOrders('all');
}

async function admLoadOrders(statusFilter) {
  const url = statusFilter && statusFilter !== 'all' ? `/admin/orders?status=${statusFilter}` : '/admin/orders';
  const res = await api(url);
  const container = document.getElementById('adm-orders-body');
  if (!container) return;
  if (!res || res.error) { container.innerHTML = `<div class="adm-error">Failed to load orders: ${esc(res?.error||'Network error')}</div>`; return; }

  ADM.orders = res.orders || [];
  if (!ADM.orders.length) { container.innerHTML = `<div class="adm-empty"><div class="adm-empty-icon">📋</div>No orders found.</div>`; return; }

  container.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>Order #</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
    <tbody id="adm-orders-rows"></tbody>
  </table></div>`;

  document.getElementById('adm-orders-rows').innerHTML = ADM.orders.map(o => `
    <tr id="adm-order-row-${o.id}">
      <td style="color:var(--gold);font-weight:600;white-space:nowrap">${esc(o.order_number)}</td>
      <td>${esc(o.shipping_name||o.guest_email||'—')}</td>
      <td style="color:var(--muted);white-space:nowrap">${new Date(o.created_at).toLocaleDateString()}</td>
      <td style="font-weight:600">Br ${parseFloat(o.total).toLocaleString()}</td>
      <td><span class="adm-badge ${esc(o.status)}" id="adm-obadge-${o.id}">${esc(o.status)}</span></td>
      <td style="white-space:nowrap">
        <select class="adm-select" id="adm-osel-${o.id}" onchange="admUpdateOrderStatus(${o.id},this.value)">
          ${['pending','processing','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}"${o.status===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
          ).join('')}
        </select>
      </td>
    </tr>`).join('');
}

function admFilterOrders(status, btn) {
  document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  admLoadOrders(status);
}

async function admUpdateOrderStatus(orderId, newStatus) {
  const sel = document.getElementById(`adm-osel-${orderId}`);
  const badge = document.getElementById(`adm-obadge-${orderId}`);
  if (sel) sel.disabled = true;
  const res = await api(`/admin/orders/${orderId}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
  if (sel) sel.disabled = false;
  if (res && !res.error) {
    if (badge) { badge.textContent = newStatus; badge.className = `adm-badge ${newStatus}`; }
    toast(`Order status updated to "${newStatus}"`, 'success');
  } else {
    toast('Failed to update order status', 'error');
    if (sel) sel.value = sel.dataset.original || newStatus;
  }
}

// ═════════════════════════════════════════════════════════
// PRODUCTS
// ═════════════════════════════════════════════════════════
async function admRenderProducts(el) {
  el.innerHTML = `
    <div class="adm-header">
      <div class="adm-title">Product Management</div>
      <button class="adm-btn adm-btn-gold" onclick="admShowProductForm(null)">+ Add Product</button>
    </div>
    <div class="adm-card" id="adm-product-form-wrap" style="display:none"></div>
    <div class="adm-card">
      <div class="adm-card-title">All Products</div>
      <div id="adm-products-body"><div class="adm-skel" style="height:200px"></div></div>
    </div>`;

  // Load categories for the form selector
  const catRes = await api('/categories');
  ADM.categories = catRes?.categories || [];

  await admLoadProducts();
}

async function admLoadProducts() {
  const res = await api('/admin/products');
  const container = document.getElementById('adm-products-body');
  if (!container) return;
  if (!res || res.error) { container.innerHTML = `<div class="adm-error">Failed to load products: ${esc(res?.error||'Network error')}</div>`; return; }

  ADM.products = res.products || [];
  if (!ADM.products.length) { container.innerHTML = `<div class="adm-empty"><div class="adm-empty-icon">📦</div>No products yet.</div>`; return; }

  container.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>Image</th><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${ADM.products.map(p => {
      const imgs = Array.isArray(p.images) ? p.images : (p.images ? JSON.parse(p.images) : []);
      const thumb = imgs[0] || '';
      return `<tr>
        <td>${thumb ? `<img src="${esc(getMediaUrl(thumb))}" class="adm-prod-thumb" alt="">` : '<div style="width:40px;height:40px;border-radius:var(--r);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:1.2rem">📷</div>'}</td>
        <td style="font-weight:600;max-width:180px">${esc(OCFI18n.catalogText(p, 'name'))}</td>
        <td style="color:var(--muted);font-size:.7rem">${esc(p.sku||'—')}</td>
        <td>Br ${parseFloat(p.price).toLocaleString()}</td>
        <td>${p.stock <= 4 ? `<span class="adm-low-stock">⚠ ${p.stock}</span>` : p.stock}</td>
        <td style="color:var(--muted)">${esc(OCFI18n.catalogText(p, 'category_name')||'—')}</td>
        <td><span class="adm-badge ${p.is_active?'active':'inactive'}">${p.is_active?'Active':'Inactive'}</span></td>
        <td>
          <div style="display:flex;gap:.4rem;align-items:center">
            <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="admShowProductForm(${p.id})">✏ Edit</button>
            <button class="adm-btn adm-btn-danger adm-btn-sm" id="adm-del-btn-${p.id}" onclick="admPromptDeleteProduct(${p.id})">🗑 Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

function admShowProductForm(productId) {
  ADM.editingProduct = productId;
  const product = productId ? ADM.products.find(p => p.id === productId) : null;
  const wrap = document.getElementById('adm-product-form-wrap');
  if (!wrap) return;

  const imgs = product ? (Array.isArray(product.images) ? product.images : JSON.parse(product.images||'[]')) : [];
  const existingImg = imgs[0] || '';

  const catOptions = ADM.categories.map(c =>
    `<option value="${c.id}"${product?.category_id===c.id?' selected':''}>${esc(OCFI18n.catalogText(c, 'name'))}</option>`
  ).join('');

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="adm-card-title">${product ? '✏ Edit Product' : '+ New Product'}</div>
    <form id="adm-product-form" onsubmit="admSubmitProduct(event)">
      <div class="adm-form-grid">
        <div class="adm-form-full"><strong>English</strong></div>
        <div>
          <label class="adm-label">Name (English) *</label>
          <input class="adm-input" id="apf-name-en" value="${esc(product?.name_en||product?.name||'')}" required maxlength="255">
        </div>
        <div class="adm-form-full"><strong>Afaan Oromoo</strong></div>
        <div>
          <label class="adm-label">Name (Afaan Oromoo)</label>
          <input class="adm-input" id="apf-name-om" value="${esc(product?.name_om||'')}" maxlength="255">
        </div>
        <div>
          <label class="adm-label">SKU</label>
          <input class="adm-input" id="apf-sku" value="${esc(product?.sku||'')}" placeholder="e.g. OCF-M-001">
        </div>
        <div>
          <label class="adm-label">Price (Br) *</label>
          <input class="adm-input" id="apf-price" type="number" min="0" step="0.01" value="${product?.price||''}" required placeholder="9500">
        </div>
        <div>
          <label class="adm-label">Compare Price (Br)</label>
          <input class="adm-input" id="apf-compare-price" type="number" min="0" step="0.01" value="${product?.compare_price||''}" placeholder="12000">
        </div>
        <div>
          <label class="adm-label">Stock Quantity</label>
          <input class="adm-input" id="apf-stock" type="number" min="0" value="${product?.stock??0}" placeholder="50">
        </div>
        <div>
          <label class="adm-label">Category</label>
          <select class="adm-input adm-select" id="apf-category">${catOptions}</select>
        </div>
        <div>
          <label class="adm-label">Region</label>
          <input class="adm-input" id="apf-region" value="${esc(product?.region||'')}" placeholder="e.g. Wallagga">
        </div>
        <div>
          <label class="adm-label">Material</label>
          <input class="adm-input" id="apf-material" value="${esc(product?.material||'')}" placeholder="e.g. Hand-woven Cotton">
        </div>
        <div class="adm-form-full">
          <label class="adm-label">Short Description</label>
          <input class="adm-input" id="apf-short-desc" value="${esc(product?.short_desc||'')}" placeholder="Brief product summary">
        </div>
        <div class="adm-form-full">
          <label class="adm-label">Description (English)</label>
          <textarea class="adm-input adm-textarea" id="apf-desc-en">${esc(product?.description_en??product?.description??'')}</textarea>
        </div>
        <div class="adm-form-full"><strong>Afaan Oromoo</strong></div>
        <div class="adm-form-full">
          <label class="adm-label">Description (Afaan Oromoo)</label>
          <textarea class="adm-input adm-textarea" id="apf-desc-om">${esc(product?.description_om||'')}</textarea>
        </div>
        <div class="adm-form-full">
          <label class="adm-label">Product Image</label>
          <div class="adm-upload-zone" id="adm-drop-zone" onclick="document.getElementById('apf-img-file').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="admHandleDrop(event)">
            <div style="font-size:2rem;margin-bottom:.5rem">📷</div>
            <div style="font-size:.8rem;color:var(--muted)">Click or drag & drop to upload (JPEG / PNG / WebP, max 5 MB)</div>
            ${existingImg ? `<img src="${esc(getMediaUrl(existingImg))}" class="adm-img-preview" id="adm-img-preview" alt="">` : '<img class="adm-img-preview" id="adm-img-preview" style="display:none" alt="">'}
          </div>
          <input type="file" id="apf-img-file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="admUploadImage(this)">
          <input type="hidden" id="apf-img-url" value="${esc(existingImg)}">
          <div id="adm-upload-status" style="font-size:.72rem;color:var(--muted);margin-top:.4rem"></div>
        </div>
        <div class="adm-form-full" style="display:flex;gap:1.5rem;flex-wrap:wrap">
          <label class="adm-checkbox-row"><input type="checkbox" id="apf-best-seller"${product?.is_best_seller?' checked':''}> Best Seller</label>
          <label class="adm-checkbox-row"><input type="checkbox" id="apf-featured"${product?.is_featured?' checked':''}> Featured</label>
          ${product ? `<label class="adm-checkbox-row"><input type="checkbox" id="apf-active"${product?.is_active!==false?' checked':''}> Active (visible to customers)</label>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:.75rem;margin-top:1.5rem;flex-wrap:wrap">
        <button type="submit" class="adm-btn adm-btn-gold" id="adm-submit-btn">${product ? '💾 Save Changes' : '✚ Create Product'}</button>
        <button type="button" class="adm-btn adm-btn-ghost" onclick="admCancelProductForm()">Cancel</button>
      </div>
    </form>`;

  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function admCancelProductForm() {
  const wrap = document.getElementById('adm-product-form-wrap');
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
  ADM.editingProduct = null;
}

async function admUploadImage(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('adm-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const headers = {};
    if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
    const res = await fetch(`${API}/admin/upload`, { method: 'POST', headers, body: formData });
    const data = await res.json();

    if (res.ok && data.url) {
      document.getElementById('apf-img-url').value = data.url;
      const preview = document.getElementById('adm-img-preview');
      if (preview) {
        preview.src = getMediaUrl(data.url);
        preview.style.display = 'block';
      }
      if (statusEl) statusEl.textContent = '✓ Image uploaded successfully';
      toast('Image uploaded', 'success');
    } else {
      if (statusEl) statusEl.textContent = `✗ ${data.error || 'Upload failed'}`;
      toast(data.error || 'Upload failed', 'error');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '✗ Network error during upload';
    toast('Upload network error', 'error');
  }
}

function admHandleDrop(event) {
  event.preventDefault();
  document.getElementById('adm-drop-zone').classList.remove('drag');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const input = document.getElementById('apf-img-file');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  admUploadImage(input);
}

async function admSubmitProduct(e) {
  e.preventDefault();
  const btn = document.getElementById('adm-submit-btn');
  const originalText = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const imgUrl = document.getElementById('apf-img-url').value;
  const images = imgUrl ? [imgUrl] : [];

  const payload = {
    name_en:       document.getElementById('apf-name-en').value.trim(),
    name_om:       document.getElementById('apf-name-om').value.trim(),
    sku:           document.getElementById('apf-sku').value.trim() || null,
    price:         parseFloat(document.getElementById('apf-price').value),
    compare_price: parseFloat(document.getElementById('apf-compare-price').value) || null,
    stock:         parseInt(document.getElementById('apf-stock').value, 10) || 0,
    category_id:   parseInt(document.getElementById('apf-category').value, 10),
    region:        document.getElementById('apf-region').value.trim(),
    material:      document.getElementById('apf-material').value.trim(),
    short_desc:    document.getElementById('apf-short-desc').value.trim(),
    description_en: document.getElementById('apf-desc-en').value.trim(),
    description_om: document.getElementById('apf-desc-om').value.trim(),
    images,
    is_best_seller: document.getElementById('apf-best-seller').checked,
    is_featured:    document.getElementById('apf-featured').checked,
    is_active:      ADM.editingProduct ? document.getElementById('apf-active')?.checked ?? true : true,
  };

  let res;
  if (ADM.editingProduct) {
    res = await api(`/admin/products/${ADM.editingProduct}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    res = await api('/admin/products', { method: 'POST', body: JSON.stringify(payload) });
  }

  btn.disabled = false;
  btn.textContent = originalText;

  if (res && !res.error) {
    toast(ADM.editingProduct ? 'Product updated successfully' : 'Product created successfully', 'success');
    admCancelProductForm();
    await admLoadProducts();
  } else {
    toast(`Error: ${res?.error || 'Request failed'}`, 'error');
  }
}

async function admRenderCategories(el) {
  el.innerHTML = `
    <div class="adm-header">
      <div class="adm-title">Category Management</div>
      <button class="adm-btn adm-btn-gold" onclick="admShowCategoryForm(null)">+ Add Category</button>
    </div>
    <div class="adm-card" id="adm-category-form-wrap" style="display:none"></div>
    <div class="adm-card">
      <div class="adm-card-title">All Categories</div>
      <div id="adm-categories-body"><div class="adm-skel" style="height:180px"></div></div>
    </div>`;
  await admLoadCategories();
}

async function admLoadCategories() {
  const res = await api('/admin/categories');
  const container = document.getElementById('adm-categories-body');
  if (!container) return;
  if (!res || res.error) {
    container.innerHTML = `<div class="adm-error">Failed to load categories: ${esc(res?.error || 'Network error')}</div>`;
    return;
  }
  ADM.categories = res.categories || [];
  if (!ADM.categories.length) {
    container.innerHTML = '<div class="adm-empty">No categories yet.</div>';
    return;
  }
  container.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>English</th><th>Afaan Oromoo</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${ADM.categories.map(category => `<tr>
      <td>${esc(OCFI18n.catalogText({ ...category, name_om: null }, 'name'))}</td>
      <td>${esc(category.name_om || category.name_en || category.name)}</td>
      <td>${esc(category.slug)}</td>
      <td><span class="adm-badge ${category.is_active ? 'active' : 'inactive'}">${category.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="admShowCategoryForm(${category.id})">✏ Edit</button>
        <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admDeleteCategory(${category.id})">🗑 Delete</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function admShowCategoryForm(categoryId) {
  const category = categoryId ? ADM.categories.find(item => item.id === categoryId) : null;
  const wrap = document.getElementById('adm-category-form-wrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  wrap.innerHTML = `<div class="adm-card-title">${category ? '✏ Edit Category' : '+ New Category'}</div>
    <form onsubmit="admSubmitCategory(event,${category ? category.id : 'null'})">
      <div class="adm-form-grid">
        <div class="adm-form-full"><strong>English</strong></div>
        <div><label class="adm-label">Name *</label><input class="adm-input" id="acf-name-en" required maxlength="255" value="${esc(category?.name_en || category?.name || '')}"></div>
        <div class="adm-form-full"><strong>Afaan Oromoo</strong></div>
        <div><label class="adm-label">Name (Afaan Oromoo)</label><input class="adm-input" id="acf-name-om" maxlength="255" value="${esc(category?.name_om || '')}"></div>
        <div><label class="adm-label">Slug *</label><input class="adm-input" id="acf-slug" required value="${esc(category?.slug || '')}"></div>
        <div><label class="adm-label">Region</label><input class="adm-input" id="acf-region" value="${esc(category?.region || '')}"></div>
        <div class="adm-form-full"><label class="adm-label">Description (English)</label><textarea class="adm-input adm-textarea" id="acf-description-en">${esc(category?.description_en ?? category?.description ?? '')}</textarea></div>
        <div class="adm-form-full"><label class="adm-label">Description (Afaan Oromoo)</label><textarea class="adm-input adm-textarea" id="acf-description-om">${esc(category?.description_om || '')}</textarea></div>
        ${category ? `<label class="adm-checkbox-row"><input type="checkbox" id="acf-active"${category.is_active ? ' checked' : ''}> Active</label>` : ''}
      </div>
      <div style="display:flex;gap:.75rem;margin-top:1.25rem">
        <button type="submit" class="adm-btn adm-btn-gold" id="acf-submit">Save Category</button>
        <button type="button" class="adm-btn adm-btn-ghost" onclick="document.getElementById('adm-category-form-wrap').style.display='none'">Cancel</button>
      </div>
    </form>`;
}

async function admSubmitCategory(event, categoryId) {
  event.preventDefault();
  const button = document.getElementById('acf-submit');
  button.disabled = true;
  const payload = {
    name_en: document.getElementById('acf-name-en').value.trim(),
    name_om: document.getElementById('acf-name-om').value.trim() || null,
    slug: document.getElementById('acf-slug').value.trim(),
    region: document.getElementById('acf-region').value.trim(),
    description_en: document.getElementById('acf-description-en').value.trim(),
    description_om: document.getElementById('acf-description-om').value.trim(),
    is_active: categoryId ? document.getElementById('acf-active').checked : true
  };
  const res = await api(categoryId ? `/admin/categories/${categoryId}` : '/admin/categories', {
    method: categoryId ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });
  button.disabled = false;
  if (res && !res.error) {
    toast(categoryId ? 'Category updated successfully' : 'Category created successfully', 'success');
    await admLoadCategories();
    const form = document.getElementById('adm-category-form-wrap');
    if (form) { form.style.display = 'none'; form.innerHTML = ''; }
  } else {
    toast(`Error: ${res?.error || 'Request failed'}`, 'error');
  }
}

async function admDeleteCategory(categoryId) {
  if (!confirm('Delete this category? Products will remain and become uncategorized.')) return;
  const res = await api(`/admin/categories/${categoryId}`, { method: 'DELETE' });
  if (res && !res.error) {
    toast('Category deleted successfully', 'success');
    await admLoadCategories();
  } else {
    toast(`Error: ${res?.error || 'Request failed'}`, 'error');
  }
}

// ── Product Deletion Modal & Handlers ───────────────────
function admEscapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function admPromptDeleteProduct(productId) {
  const product = ADM.products.find(p => p.id === productId);
  if (!product) return;

  // Remove existing modal if any
  const existingModal = document.getElementById('adm-confirm-modal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div class="adm-modal-backdrop" id="adm-confirm-modal" onclick="if(event.target===this) admCloseDeleteModal()">
      <div class="adm-modal-dialog">
        <div class="adm-modal-icon">⚠️</div>
        <div class="adm-modal-title">Delete Product</div>
        <div class="adm-modal-desc">
          Are you sure you want to delete <strong>${admEscapeHtml(product.name)}</strong> (ID: ${product.id})?<br>
          <span style="color:var(--muted);font-size:.75rem">This action cannot be undone. Historical order data will remain intact.</span>
        </div>
        <div class="adm-modal-actions">
          <button type="button" class="adm-btn adm-btn-ghost" id="adm-cancel-del-btn" onclick="admCloseDeleteModal()">Cancel</button>
          <button type="button" class="adm-btn adm-btn-danger" id="adm-confirm-del-btn" onclick="admExecuteDeleteProduct(${productId})">🗑 Yes, Delete</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function admCloseDeleteModal() {
  const modal = document.getElementById('adm-confirm-modal');
  if (modal) modal.remove();
}

async function admExecuteDeleteProduct(productId) {
  const confirmBtn = document.getElementById('adm-confirm-del-btn');
  const cancelBtn = document.getElementById('adm-cancel-del-btn');
  const rowDelBtn = document.getElementById(`adm-del-btn-${productId}`);

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ Deleting…';
  }
  if (cancelBtn) cancelBtn.disabled = true;
  if (rowDelBtn) {
    rowDelBtn.disabled = true;
    rowDelBtn.innerHTML = '⏳ Deleting…';
  }

  try {
    const res = await api(`/admin/products/${productId}`, {
      method: 'DELETE'
    });

    if (res && !res.error) {
      admCloseDeleteModal();
      toast('Product deleted successfully', 'success');
      // If we were editing this product in the form, close the form
      if (ADM.editingProduct === productId) {
        admCancelProductForm();
      }
      await admLoadProducts();
    } else {
      toast(`Error: ${res?.error || 'Failed to delete product'}`, 'error');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '🗑 Yes, Delete';
      }
      if (cancelBtn) cancelBtn.disabled = false;
      if (rowDelBtn) {
        rowDelBtn.disabled = false;
        rowDelBtn.innerHTML = '🗑 Delete';
      }
    }
  } catch (err) {
    toast('Network error while deleting product', 'error');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '🗑 Yes, Delete';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (rowDelBtn) {
      rowDelBtn.disabled = false;
      rowDelBtn.innerHTML = '🗑 Delete';
    }
  }
}


// ═════════════════════════════════════════════════════════
// USERS
// ═════════════════════════════════════════════════════════
async function admRenderUsers(el) {
  el.innerHTML = `
    <div class="adm-header">
      <div class="adm-title">User Accounts</div>
      <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="goAdmin('users')">↻ Refresh</button>
    </div>
    <div class="adm-card">
      <div class="adm-card-title">All Users</div>
      <div id="adm-users-body"><div class="adm-skel" style="height:200px"></div></div>
    </div>`;

  const res = await api('/admin/users');
  const container = document.getElementById('adm-users-body');
  if (!container) return;
  if (!res || res.error) { container.innerHTML = `<div class="adm-error">Failed to load users: ${res?.error||'Network error'}</div>`; return; }

  const users = res.users || [];
  if (!users.length) { container.innerHTML = `<div class="adm-empty"><div class="adm-empty-icon">👥</div>No users yet.</div>`; return; }

  container.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Country</th><th>Joined</th></tr></thead>
    <tbody>${users.map(u => `
      <tr>
        <td style="color:var(--muted)">${u.id}</td>
        <td style="font-weight:600">${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="adm-badge ${u.role==='admin'?'delivered':'active'}">${esc(u.role)}</span></td>
        <td style="color:var(--muted)">${esc(u.country||'—')}</td>
        <td style="color:var(--muted)">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}
