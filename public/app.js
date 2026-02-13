/* ===== KOPERASI WEB — Frontend Logic ===== */

const state = {
  token: localStorage.getItem('koperasi_token') || '',
  username: localStorage.getItem('koperasi_username') || '',
  products: [],
  movements: [],
  transactions: [],
};

// Dynamic API URL: localhost → local proxy, production → Cloudflare Workers
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api';
  }
  return 'https://koperasi-web-prod.kmbpendidikanekonomi.workers.dev/api';
})();

/* ===== DOM Elements ===== */
const $ = (id) => document.getElementById(id);

const loginView = $('loginView');
const appView = $('appView');
const loginForm = $('loginForm');
const loginError = $('loginError');
const adminBadge = $('adminBadge');
const loadingOverlay = $('loadingOverlay');

const kasirTab = $('kasirTab');
const barangTab = $('barangTab');
const txItemsBody = $('txItemsBody');
const txTotal = $('txTotal');

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

/* ===== Utilities ===== */
function showLoading() { loadingOverlay && loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay && loadingOverlay.classList.add('hidden'); }

function showSuccess(message) {
  successMsg.textContent = message;
  successModal.classList.remove('hidden');
}
function showError(message) {
  errorMsg.textContent = message;
  errorModal.classList.remove('hidden');
}
function hideModals() {
  successModal.classList.add('hidden');
  errorModal.classList.add('hidden');
}

successModalBtn.addEventListener('click', hideModals);
errorModalBtn.addEventListener('click', hideModals);
successModal.addEventListener('click', (e) => { if (e.target === successModal) hideModals(); });
errorModal.addEventListener('click', (e) => { if (e.target === errorModal) hideModals(); });

// Close modals with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideModals();
});

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

/* ===== API Fetch ===== */
async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  const isJson = String(response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(body?.message || `Server error ${response.status}`);
  }
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
  // Toggle panels
  if (tab === 'barang') {
    kasirTab.classList.add('hidden');
    barangTab.classList.remove('hidden');
  } else {
    barangTab.classList.add('hidden');
    kasirTab.classList.remove('hidden');
  }
  // Update tab button active state
  document.querySelectorAll('.btn-tab[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

/* ===== Toggle Password ===== */
const togglePwBtn = $('togglePwBtn');
if (togglePwBtn) {
  togglePwBtn.addEventListener('click', () => {
    const pw = $('password');
    if (pw.type === 'password') {
      pw.type = 'text';
      togglePwBtn.textContent = '🙈';
    } else {
      pw.type = 'password';
      togglePwBtn.textContent = '👁️';
    }
  });
}

/* ===== Product Helpers ===== */
function updateStats() {
  const total = state.products.length;
  const low = state.products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const empty = state.products.filter((p) => p.stock === 0).length;
  const st = $('statTotal'); if (st) st.textContent = total;
  const sl = $('statLow'); if (sl) sl.textContent = low;
  const se = $('statEmpty'); if (se) se.textContent = empty;
}

function makeProductOptions() {
  adjustProductId.innerHTML = state.products
    .map((p) => `<option value="${p.id}">${p.name} (stok: ${p.stock})</option>`)
    .join('');
}

function renderProducts(filter = '') {
  const q = filter.toLowerCase();
  const filtered = q
    ? state.products.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    : state.products;

  productsBody.innerHTML = filtered
    .map((p) => {
      let stockBadge = 'badge-success';
      if (p.stock <= p.minStock && p.stock > 0) stockBadge = 'badge-warning';
      if (p.stock === 0) stockBadge = 'badge-danger';

      return `<tr>
        <td><code>${p.id}</code></td>
        <td><strong>${p.name}</strong></td>
        <td>${formatRupiah(p.sellPrice)}</td>
        <td>${formatRupiah(p.buyPrice)}</td>
        <td><span class="badge ${stockBadge}">${p.stock} unit</span></td>
        <td>${p.minStock}</td>
      </tr>`;
    })
    .join('');

  makeProductOptions();
  updateStats();
}

function renderMovements() {
  movementsBody.innerHTML = state.movements
    .map((mv) => {
      const typeBadge = mv.type === 'IN' ? 'badge-success' : 'badge-danger';
      const icon = mv.type === 'IN' ? '➕' : '➖';
      return `<tr>
        <td>${formatDate(mv.createdAt)}</td>
        <td><strong>${mv.productName || '-'}</strong></td>
        <td><span class="badge ${typeBadge}">${icon} ${mv.type}</span></td>
        <td>${mv.qty}</td>
        <td><strong>${mv.balanceAfter}</strong></td>
        <td>${mv.note || '-'}</td>
        <td>${mv.actor || '-'}</td>
      </tr>`;
    })
    .join('');
}

function renderTxHistory() {
  txHistoryBody.innerHTML = state.transactions
    .map((tx) => `<tr>
        <td><code>${tx.id}</code></td>
        <td>${formatDate(tx.createdAt)}</td>
        <td>${tx.cashier || '-'}</td>
        <td>${tx.memberName || '-'}</td>
        <td><span class="badge badge-primary">${tx.paymentMethod || '-'}</span></td>
        <td><strong>${formatRupiah(tx.total)}</strong></td>
      </tr>`)
    .join('');
}

/* ===== Transaction Item Rows ===== */
function recalcTransactionTotal() {
  const rows = Array.from(txItemsBody.querySelectorAll('tr'));
  let total = 0;
  rows.forEach((row) => {
    const productId = row.querySelector('.tx-product').value;
    const qty = Number(row.querySelector('.tx-qty').value || 0);
    const product = state.products.find((item) => item.id === productId);
    const price = Number(product?.sellPrice || 0);
    const subtotal = qty * price;
    row.querySelector('.tx-price').textContent = formatRupiah(price);
    row.querySelector('.tx-subtotal').textContent = formatRupiah(subtotal);
    total += subtotal;
  });
  txTotal.textContent = formatRupiah(total);
}

function addTransactionItemRow() {
  if (!state.products.length) {
    showError('Belum ada barang. Tambahkan barang dulu di tab Pembukuan Barang.');
    return;
  }
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>
      <select class="tx-product">
        ${state.products.map((p) => `<option value="${p.id}">${p.name} (${p.stock})</option>`).join('')}
      </select>
    </td>
    <td><input class="tx-qty" type="number" min="1" value="1" style="width:70px" /></td>
    <td class="tx-price">${formatRupiah(0)}</td>
    <td class="tx-subtotal">${formatRupiah(0)}</td>
    <td><button type="button" class="btn-danger btn-sm tx-remove">✕</button></td>
  `;
  row.querySelector('.tx-product').addEventListener('change', recalcTransactionTotal);
  row.querySelector('.tx-qty').addEventListener('input', recalcTransactionTotal);
  row.querySelector('.tx-remove').addEventListener('click', () => { row.remove(); recalcTransactionTotal(); });
  txItemsBody.appendChild(row);
  recalcTransactionTotal();
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
    recalcTransactionTotal();
  } finally {
    hideLoading();
  }
}

/* ===== Search Products ===== */
const productSearch = $('productSearch');
if (productSearch) {
  productSearch.addEventListener('input', () => {
    renderProducts(productSearch.value);
  });
}

/* ===== Event Handlers ===== */

// LOGIN
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const username = $('username').value.trim();
  const password = $('password').value;
  const loginBtn = $('loginBtn');
  const originalHTML = loginBtn.innerHTML;
  loginBtn.innerHTML = '<span>⏳ Memverifikasi…</span>';
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
    if (!txItemsBody.children.length) addTransactionItemRow();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    loginBtn.innerHTML = originalHTML;
    loginBtn.disabled = false;
  }
});

// LOGOUT
$('logoutBtn').addEventListener('click', () => {
  state.token = '';
  state.username = '';
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
  try {
    await loadData();
    showSuccess('Data berhasil diperbarui.');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
  }
});

// ADD TX ITEM
$('addTxItemBtn').addEventListener('click', addTransactionItemRow);

// SAVE TRANSACTION
$('saveTxBtn').addEventListener('click', async () => {
  const rows = Array.from(txItemsBody.querySelectorAll('tr'));
  if (!rows.length) { showError('Tambahkan item transaksi terlebih dahulu.'); return; }

  const items = rows.map((row) => ({
    productId: row.querySelector('.tx-product').value,
    qty: Number(row.querySelector('.tx-qty').value || 0),
  }));
  const memberName = $('memberName').value.trim();
  const paymentMethod = $('paymentMethod').value;

  const btn = $('saveTxBtn');
  const orig = btn.textContent;
  btn.textContent = '⏳ Menyimpan…';
  btn.disabled = true;

  try {
    await apiFetch(API_BASE + '/transactions', {
      method: 'POST',
      body: JSON.stringify({ memberName, paymentMethod, items }),
    });
    txItemsBody.innerHTML = '';
    $('memberName').value = '';
    await loadData();
    addTransactionItemRow();
    showSuccess('Transaksi berhasil disimpan!');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
});

// SAVE PRODUCT
$('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    id: $('productId').value.trim() || undefined,
    name: $('productName').value.trim(),
    sellPrice: Number($('sellPrice').value || 0),
    buyPrice: Number($('buyPrice').value || 0),
    stock: Number($('stock').value || 0),
    minStock: Number($('minStock').value || 0),
  };

  const btn = event.target.querySelector('button[type="submit"]');
  const orig = btn.textContent;
  btn.textContent = '⏳ Menyimpan…';
  btn.disabled = true;

  try {
    await apiFetch(API_BASE + '/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    event.target.reset();
    await loadData();
    showSuccess('Barang berhasil disimpan!');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
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
    await apiFetch(API_BASE + '/stock-adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    event.target.reset();
    await loadData();
    showSuccess('Penyesuaian stok berhasil disimpan!');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
});

/* ===== Bootstrap ===== */
(async function bootstrap() {
  if (!state.token) { showLogin(); return; }

  try {
    showApp();
    setTab('kasir');
    await loadData();
    if (!txItemsBody.children.length) addTransactionItemRow();
  } catch (_error) {
    // Token expired or invalid — go back to login
    state.token = '';
    state.username = '';
    localStorage.removeItem('koperasi_token');
    localStorage.removeItem('koperasi_username');
    showLogin();
  }
})();
