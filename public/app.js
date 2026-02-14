/* ===== KOPERASI WEB — Frontend Logic v2 ===== */

const state = {
  token: localStorage.getItem('koperasi_token') || '',
  username: localStorage.getItem('koperasi_username') || '',
  products: [],
  movements: [],
  transactions: [],
  cart: [], // { productId, name, price, qty, stock }
};

// Dynamic API URL
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') return '/api';
  return 'https://koperasi-web-prod.kmbpendidikanekonomi.workers.dev/api';
})();

/* ===== DOM Helpers ===== */
const $ = (id) => document.getElementById(id);

const loginView = $('loginView');
const appView = $('appView');
const loginForm = $('loginForm');
const loginError = $('loginError');
const adminBadge = $('adminBadge');
const loadingOverlay = $('loadingOverlay');
const kasirTab = $('kasirTab');
const barangTab = $('barangTab');
const productsBody = $('productsBody');
const movementsBody = $('movementsBody');
const txHistoryBody = $('txHistoryBody');
const adjustProductId = $('adjustProductId');
const successModal = $('successModal');
const errorModal = $('errorModal');
const successMsg = $('successMsg');
const errorMsg = $('errorMsg');
const successModalBtn = $('successModalBtn');
const errorModalBtn = $('errorModalBtn');
const receiptModal = $('receiptModal');
const receiptContent = $('receiptContent');
const receiptModalBtn = $('receiptModalBtn');

/* ===== Utilities ===== */
function showLoading() { loadingOverlay && loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay && loadingOverlay.classList.add('hidden'); }

function showSuccess(message) { successMsg.textContent = message; successModal.classList.remove('hidden'); }
function showError(message) { errorMsg.textContent = message; errorModal.classList.remove('hidden'); }
function hideModals() { successModal.classList.add('hidden'); errorModal.classList.add('hidden'); receiptModal.classList.add('hidden'); }

successModalBtn.addEventListener('click', hideModals);
errorModalBtn.addEventListener('click', hideModals);
receiptModalBtn.addEventListener('click', hideModals);
successModal.addEventListener('click', (e) => { if (e.target === successModal) hideModals(); });
errorModal.addEventListener('click', (e) => { if (e.target === errorModal) hideModals(); });
receiptModal.addEventListener('click', (e) => { if (e.target === receiptModal) hideModals(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideModals(); });

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

/* ===== Clock ===== */
function updateClock() {
  const el = $('clockDisplay');
  if (el) el.textContent = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
setInterval(updateClock, 30000);
updateClock();

/* ===== API Fetch ===== */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const isJson = String(response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(body?.message || `Server error ${response.status}`);
  return body;
}

/* ===== View Switching ===== */
function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  adminBadge.textContent = `👤 ${state.username}`;
}
function showLogin() {
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
  loginError.textContent = '';
}

function setTab(tab) {
  if (tab === 'barang') { kasirTab.classList.add('hidden'); barangTab.classList.remove('hidden'); }
  else { barangTab.classList.add('hidden'); kasirTab.classList.remove('hidden'); }
  document.querySelectorAll('.btn-tab[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

/* ===== Toggle Password ===== */
const togglePwBtn = $('togglePwBtn');
if (togglePwBtn) {
  togglePwBtn.addEventListener('click', () => {
    const pw = $('password');
    if (pw.type === 'password') { pw.type = 'text'; togglePwBtn.textContent = '🙈'; }
    else { pw.type = 'password'; togglePwBtn.textContent = '👁️'; }
  });
}

/* ===== Stats ===== */
function updateStats() {
  const total = state.products.length;
  const low = state.products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const empty = state.products.filter((p) => p.stock === 0).length;
  const value = state.products.reduce((sum, p) => sum + (p.buyPrice * p.stock), 0);
  const st = $('statTotal'); if (st) st.textContent = total;
  const sl = $('statLow'); if (sl) sl.textContent = low;
  const se = $('statEmpty'); if (se) se.textContent = empty;
  const sv = $('statValue'); if (sv) sv.textContent = formatRupiah(value);
}

/* ===== Product Grid (Kasir) ===== */
function renderProductGrid(filter = '') {
  const grid = $('productGrid');
  if (!grid) return;
  const q = filter.toLowerCase();
  const filtered = q
    ? state.products.filter((p) => p.name.toLowerCase().includes(q))
    : state.products;

  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-400)">Tidak ada barang ditemukan</div>';
    return;
  }

  grid.innerHTML = filtered.map((p) => {
    const oos = p.stock <= 0;
    const low = p.stock > 0 && p.stock <= p.minStock;
    const stockClass = oos ? 'empty' : low ? 'low' : '';
    const stockText = oos ? 'Habis' : `Stok: ${p.stock}`;
    return `<div class="product-card ${oos ? 'out-of-stock' : ''}" data-id="${p.id}" onclick="addToCart('${p.id}')">
      <div class="p-name" title="${p.name}">${p.name}</div>
      <div class="p-price">${formatRupiah(p.sellPrice)}</div>
      <div class="p-stock ${stockClass}">${stockText}</div>
    </div>`;
  }).join('');
}

/* ===== Cart ===== */
function addToCart(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = state.cart.find((c) => c.productId === productId);
  if (existing) {
    if (existing.qty >= product.stock) {
      showError(`Stok ${product.name} tidak mencukupi!`);
      return;
    }
    existing.qty++;
  } else {
    state.cart.push({ productId, name: product.name, price: product.sellPrice, qty: 1, stock: product.stock });
  }
  renderCart();
}
// Make addToCart global for onclick
window.addToCart = addToCart;

function updateCartQty(productId, delta) {
  const item = state.cart.find((c) => c.productId === productId);
  if (!item) return;
  const product = state.products.find((p) => p.id === productId);
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    state.cart = state.cart.filter((c) => c.productId !== productId);
  } else if (product && newQty > product.stock) {
    showError(`Stok ${product.name} maksimal ${product.stock}`);
    return;
  } else {
    item.qty = newQty;
  }
  renderCart();
}
window.updateCartQty = updateCartQty;

function removeFromCart(productId) {
  state.cart = state.cart.filter((c) => c.productId !== productId);
  renderCart();
}
window.removeFromCart = removeFromCart;

function renderCart() {
  const container = $('cartItems');
  const totalEl = $('cartTotal');
  if (!container) return;

  if (!state.cart.length) {
    container.innerHTML = `<div class="cart-empty">
      <span class="cart-empty-icon">🛒</span>
      <p>Keranjang kosong</p>
      <small>Klik barang di sebelah kiri untuk menambahkan</small>
    </div>`;
    totalEl.textContent = 'Rp 0';
    return;
  }

  let total = 0;
  container.innerHTML = state.cart.map((item) => {
    const subtotal = item.price * item.qty;
    total += subtotal;
    return `<div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name" title="${item.name}">${item.name}</div>
        <div class="cart-item-price">${formatRupiah(item.price)}</div>
      </div>
      <div class="cart-item-qty">
        <button type="button" onclick="updateCartQty('${item.productId}', -1)">−</button>
        <span class="qty-val">${item.qty}</span>
        <button type="button" onclick="updateCartQty('${item.productId}', 1)">+</button>
      </div>
      <div class="cart-item-subtotal">${formatRupiah(subtotal)}</div>
      <button type="button" class="cart-item-remove" onclick="removeFromCart('${item.productId}')">✕</button>
    </div>`;
  }).join('');
  totalEl.textContent = formatRupiah(total);
}

/* ===== Render Products Table (Barang Tab) ===== */
function makeProductOptions() {
  if (adjustProductId) {
    adjustProductId.innerHTML = state.products
      .map((p) => `<option value="${p.id}">${p.name} (stok: ${p.stock})</option>`)
      .join('');
  }
}

function renderProducts(filter = '') {
  const q = filter.toLowerCase();
  const filtered = q
    ? state.products.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    : state.products;

  productsBody.innerHTML = filtered.map((p) => {
    let statusBadge, statusText;
    if (p.stock === 0) { statusBadge = 'badge-danger'; statusText = '🚫 Habis'; }
    else if (p.stock <= p.minStock) { statusBadge = 'badge-warning'; statusText = '⚠️ Rendah'; }
    else { statusBadge = 'badge-success'; statusText = '✅ Aman'; }

    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td>${formatRupiah(p.sellPrice)}</td>
      <td>${formatRupiah(p.buyPrice)}</td>
      <td><strong>${p.stock}</strong> <small style="color:var(--gray-400)">/ min ${p.minStock}</small></td>
      <td><span class="badge ${statusBadge}">${statusText}</span></td>
    </tr>`;
  }).join('');

  makeProductOptions();
  updateStats();
}

function renderMovements() {
  movementsBody.innerHTML = state.movements.map((mv) => {
    const typeBadge = mv.type === 'IN' ? 'badge-success' : 'badge-danger';
    const icon = mv.type === 'IN' ? '📥' : '📤';
    return `<tr>
      <td>${formatDate(mv.createdAt)}</td>
      <td><strong>${mv.productName || '-'}</strong></td>
      <td><span class="badge ${typeBadge}">${icon} ${mv.type}</span></td>
      <td>${mv.qty}</td>
      <td><strong>${mv.balanceAfter}</strong></td>
      <td>${mv.note || '-'}</td>
    </tr>`;
  }).join('');
}

function renderTxHistory() {
  txHistoryBody.innerHTML = state.transactions.map((tx) => {
    const methodBadge = tx.paymentMethod === 'cash' ? '💵' : tx.paymentMethod === 'transfer' ? '🏦' : '📱';
    return `<tr>
      <td><code style="font-size:11px;color:var(--gray-400)">${tx.id}</code></td>
      <td>${formatDate(tx.createdAt)}</td>
      <td>${tx.cashier || '-'}</td>
      <td>${tx.memberName || '-'}</td>
      <td><span class="badge badge-primary">${methodBadge} ${tx.paymentMethod || '-'}</span></td>
      <td><strong>${formatRupiah(tx.total)}</strong></td>
    </tr>`;
  }).join('');
}

/* ===== Show Receipt ===== */
function showReceipt(txResult) {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const items = txResult.items || [];
  receiptContent.innerHTML = `
    <div class="receipt-header">
      <h3>🏪 Koperasi Web</h3>
      <p>${now}</p>
      <p>Kasir: ${state.username} &bull; ${txResult.paymentMethod?.toUpperCase()}</p>
      ${txResult.memberName && txResult.memberName !== '-' ? `<p>Anggota: ${txResult.memberName}</p>` : ''}
    </div>
    <hr class="receipt-divider" />
    ${items.map(it => `<div class="receipt-item">
      <div class="receipt-item-name">${it.productName}</div>
      <div class="receipt-item-detail">
        <span>${it.qty} x ${formatRupiah(it.price)}</span>
        <span>${formatRupiah(it.subtotal)}</span>
      </div>
    </div>`).join('')}
    <div class="receipt-line total">
      <span>TOTAL</span>
      <span>${formatRupiah(txResult.total)}</span>
    </div>
    <hr class="receipt-divider" />
    <p style="text-align:center;font-size:11px;color:var(--gray-400);margin-top:8px">Terima kasih atas kunjungan Anda!</p>
  `;
  receiptModal.classList.remove('hidden');
}

/* ===== Load All Data ===== */
async function loadData() {
  showLoading();
  try {
    const [products, movements, transactions] = await Promise.all([
      apiFetch(API_BASE + '/products'),
      apiFetch(API_BASE + '/movements'),
      apiFetch(API_BASE + '/transactions'),
    ]);
    state.products = products || [];
    state.movements = movements || [];
    state.transactions = transactions || [];

    renderProducts();
    renderMovements();
    renderTxHistory();
    renderProductGrid();
    renderCart();
  } finally {
    hideLoading();
  }
}

/* ===== Search ===== */
const productSearch = $('productSearch');
if (productSearch) {
  productSearch.addEventListener('input', () => renderProducts(productSearch.value));
}
const kasirSearch = $('kasirProductSearch');
if (kasirSearch) {
  kasirSearch.addEventListener('input', () => renderProductGrid(kasirSearch.value));
}

/* ===== Event Handlers ===== */

// LOGIN
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const username = $('username').value.trim();
  const password = $('password').value;
  const loginBtn = $('loginBtn');
  const origHTML = loginBtn.innerHTML;
  loginBtn.innerHTML = '⏳ Memverifikasi…';
  loginBtn.disabled = true;

  try {
    const result = await apiFetch(API_BASE + '/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = result.token;
    state.username = result.username;
    localStorage.setItem('koperasi_token', state.token);
    localStorage.setItem('koperasi_username', state.username);
    showApp();
    setTab('kasir');
    await loadData();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    loginBtn.innerHTML = origHTML;
    loginBtn.disabled = false;
  }
});

// LOGOUT
$('logoutBtn').addEventListener('click', () => {
  state.token = '';
  state.username = '';
  state.cart = [];
  localStorage.removeItem('koperasi_token');
  localStorage.removeItem('koperasi_username');
  showLogin();
});

// TAB BUTTONS
document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

// REFRESH
$('refreshBtn').addEventListener('click', async () => {
  const btn = $('refreshBtn');
  btn.disabled = true;
  try { await loadData(); showSuccess('Data berhasil diperbarui!'); }
  catch (error) { showError(error.message); }
  finally { btn.disabled = false; }
});

// CLEAR CART
$('clearCartBtn').addEventListener('click', () => {
  state.cart = [];
  renderCart();
});

// SAVE TRANSACTION (Checkout)
$('saveTxBtn').addEventListener('click', async () => {
  if (!state.cart.length) { showError('Keranjang masih kosong. Pilih barang dulu.'); return; }

  const items = state.cart.map((c) => ({ productId: c.productId, qty: c.qty }));
  const memberName = $('memberName').value.trim();
  const paymentMethod = $('paymentMethod').value;

  const btn = $('saveTxBtn');
  btn.disabled = true;

  try {
    const result = await apiFetch(API_BASE + '/transactions', {
      method: 'POST',
      body: JSON.stringify({ memberName, paymentMethod, items }),
    });
    state.cart = [];
    $('memberName').value = '';
    await loadData();
    showReceipt(result);
  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
  }
});

// SAVE PRODUCT (auto ID — no manual ID input needed)
$('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: $('productName').value.trim(),
    sellPrice: Number($('sellPrice').value || 0),
    buyPrice: Number($('buyPrice').value || 0),
    stock: Number($('stock').value || 0),
    minStock: Number($('minStock').value || 0),
  };
  // ID will be auto-generated by the backend

  const btn = event.target.querySelector('button[type="submit"]');
  const orig = btn.textContent;
  btn.textContent = '⏳ Menyimpan…';
  btn.disabled = true;

  try {
    await apiFetch(API_BASE + '/products', { method: 'POST', body: JSON.stringify(payload) });
    event.target.reset();
    await loadData();
    showSuccess('Barang berhasil ditambahkan!');
  } catch (error) { showError(error.message); }
  finally { btn.textContent = orig; btn.disabled = false; }
});

// SAVE STOCK ADJUSTMENT
$('adjustmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    productId: $('adjustProductId').value,
    type: $('adjustType').value,
    qty: Number($('adjustQty').value || 0),
    note: $('adjustNote').value.trim(),
  };

  const btn = event.target.querySelector('button[type="submit"]');
  const orig = btn.textContent;
  btn.textContent = '⏳ Menyimpan…';
  btn.disabled = true;

  try {
    await apiFetch(API_BASE + '/stock-adjustments', { method: 'POST', body: JSON.stringify(payload) });
    event.target.reset();
    await loadData();
    showSuccess('Penyesuaian stok berhasil!');
  } catch (error) { showError(error.message); }
  finally { btn.textContent = orig; btn.disabled = false; }
});

/* ===== Bootstrap ===== */
(async function bootstrap() {
  if (!state.token) { showLogin(); return; }
  try {
    showApp();
    setTab('kasir');
    await loadData();
  } catch (_error) {
    state.token = '';
    state.username = '';
    localStorage.removeItem('koperasi_token');
    localStorage.removeItem('koperasi_username');
    showLogin();
  }
})();
