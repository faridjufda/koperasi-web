const state = {
  token: localStorage.getItem('koperasi_token') || '',
  username: localStorage.getItem('koperasi_username') || '',
  products: [],
  movements: [],
  transactions: [],
};

// Dynamic API URL untuk support localhost & production
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api';
  }
  // Production: backend di Railway
  return 'https://koperasi-web.railway.app/api';
})();

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const adminBadge = document.getElementById('adminBadge');

const kasirTab = document.getElementById('kasirTab');
const barangTab = document.getElementById('barangTab');
const txItemsBody = document.getElementById('txItemsBody');
const txTotal = document.getElementById('txTotal');

const productsBody = document.getElementById('productsBody');
const movementsBody = document.getElementById('movementsBody');
const txHistoryBody = document.getElementById('txHistoryBody');
const adjustProductId = document.getElementById('adjustProductId');

const successModal = document.getElementById('successModal');
const errorModal = document.getElementById('errorModal');
const successMsg = document.getElementById('successMsg');
const errorMsg = document.getElementById('errorMsg');
const successModalBtn = document.getElementById('successModalBtn');
const errorModalBtn = document.getElementById('errorModalBtn');

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

successModal.addEventListener('click', (e) => {
  if (e.target === successModal) hideModals();
});

errorModal.addEventListener('click', (e) => {
  if (e.target === errorModal) hideModals();
});

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const isJson = String(response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(body?.message || 'Terjadi kesalahan pada server.');
  }

  return body;
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  adminBadge.textContent = `👤 Admin: ${state.username}`;
}

function showLogin() {
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

function setTab(tab) {
  if (tab === 'barang') {
    kasirTab.classList.add('hidden');
    barangTab.classList.remove('hidden');
  } else {
    barangTab.classList.add('hidden');
    kasirTab.classList.remove('hidden');
  }
}

function makeProductOptions() {
  const options = state.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.stock})</option>`)
    .join('');

  adjustProductId.innerHTML = options;
}

function renderProducts() {
  productsBody.innerHTML = state.products
    .map((product) => {
      let stockBadge = 'badge-success';
      if (product.stock <= product.minStock && product.stock > 0) {
        stockBadge = 'badge-warning';
      }
      if (product.stock === 0) {
        stockBadge = 'badge-danger';
      }

      return `
      <tr>
        <td><strong>${product.id}</strong></td>
        <td>${product.name}</td>
        <td>${formatRupiah(product.sellPrice)}</td>
        <td>${formatRupiah(product.buyPrice)}</td>
        <td><span class="badge ${stockBadge}">${product.stock} unit</span></td>
        <td>${product.minStock}</td>
      </tr>
    `;
    })
    .join('');

  makeProductOptions();
}

function renderMovements() {
  movementsBody.innerHTML = state.movements
    .map((mv) => {
      const typeIcon = mv.type === 'IN' ? '➕' : '➖';
      const typeBadge = mv.type === 'IN' ? 'badge-success' : 'badge-danger';
      return `
      <tr>
        <td>${new Date(mv.createdAt).toLocaleString('id-ID', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}</td>
        <td><strong>${mv.productName}</strong></td>
        <td><span class="badge ${typeBadge}">${typeIcon} ${mv.type}</span></td>
        <td>${mv.qty}</td>
        <td><strong>${mv.balanceAfter}</strong></td>
        <td>${mv.note || '-'}</td>
        <td>${mv.actor || '-'}</td>
      </tr>
    `;
    })
    .join('');
}

function renderTxHistory() {
  txHistoryBody.innerHTML = state.transactions
    .map(
      (tx) => `
      <tr>
        <td><strong>${tx.id}</strong></td>
        <td>${new Date(tx.createdAt).toLocaleString('id-ID', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}</td>
        <td>${tx.cashier}</td>
        <td>${tx.memberName || '-'}</td>
        <td><span class="badge badge-primary">${tx.paymentMethod}</span></td>
        <td><strong>${formatRupiah(tx.total)}</strong></td>
      </tr>
    `
    )
    .join('');
}

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
        ${state.products.map((product) => `<option value="${product.id}">${product.name}</option>`).join('')}
      </select>
    </td>
    <td><input class="tx-qty" type="number" min="1" value="1" /></td>
    <td class="tx-price">${formatRupiah(0)}</td>
    <td class="tx-subtotal">${formatRupiah(0)}</td>
    <td><button type="button" class="danger tx-remove">Hapus</button></td>
  `;

  row.querySelector('.tx-product').addEventListener('change', recalcTransactionTotal);
  row.querySelector('.tx-qty').addEventListener('input', recalcTransactionTotal);
  row.querySelector('.tx-remove').addEventListener('click', () => {
    row.remove();
    recalcTransactionTotal();
  });

  txItemsBody.appendChild(row);
  recalcTransactionTotal();
}

async function loadData() {
  const [products, movements, transactions] = await Promise.all([
    apiFetch(API_BASE + '/products'),
    apiFetch(API_BASE + '/movements'),
    apiFetch(API_BASE + '/transactions'),
  ]);

  state.products = products;
  state.movements = movements;
  state.transactions = transactions;

  renderProducts();
  renderMovements();
  renderTxHistory();
  recalcTransactionTotal();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');

  const originalText = loginBtn.textContent;
  loginBtn.textContent = '⏳ Memverifikasi...';
  loginBtn.disabled = true;

  try {
    const result = await apiFetch('/api/login', {
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

    if (!txItemsBody.children.length) {
      addTransactionItemRow();
    }
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    loginBtn.textContent = originalText;
    loginBtn.disabled = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  state.token = '';
  state.username = '';
  localStorage.removeItem('koperasi_token');
  localStorage.removeItem('koperasi_username');
  showLogin();
});

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Memuat...';
  btn.disabled = true;

  try {
    await loadData();
    showSuccess('Data berhasil diperbarui.');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('addTxItemBtn').addEventListener('click', addTransactionItemRow);

document.getElementById('saveTxBtn').addEventListener('click', async () => {
  const rows = Array.from(txItemsBody.querySelectorAll('tr'));
  if (!rows.length) {
    showError('Tambahkan item transaksi terlebih dahulu.');
    return;
  }

  const items = rows.map((row) => ({
    productId: row.querySelector('.tx-product').value,
    qty: Number(row.querySelector('.tx-qty').value || 0),
  }));

  const memberName = document.getElementById('memberName').value.trim();
  const paymentMethod = document.getElementById('paymentMethod').value;

  const btn = document.getElementById('saveTxBtn');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Menyimpan...';
  btn.disabled = true;

  try {
    await apiFetch(API_BASE + '/transactions', {
      method: 'POST',
      body: JSON.stringify({ memberName, paymentMethod, items }),
    });

    txItemsBody.innerHTML = '';
    addTransactionItemRow();
    document.getElementById('memberName').value = '';
    await loadData();
    showSuccess('Transaksi berhasil disimpan!');
  } catch (error) {
    showError(error.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    id: document.getElementById('productId').value.trim() || undefined,
    name: document.getElementById('productName').value.trim(),
    sellPrice: Number(document.getElementById('sellPrice').value || 0),
    buyPrice: Number(document.getElementById('buyPrice').value || 0),
    stock: Number(document.getElementById('stock').value || 0),
    minStock: Number(document.getElementById('minStock').value || 0),
  };

  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Menyimpan...';
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
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('adjustmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    productId: document.getElementById('adjustProductId').value,
    type: document.getElementById('adjustType').value,
    qty: Number(document.getElementById('adjustQty').value || 0),
    note: document.getElementById('adjustNote').value.trim(),
  };

  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Menyimpan...';
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
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

(async function bootstrap() {
  if (!state.token) {
    showLogin();
    return;
  }

  try {
    showApp();
    setTab('kasir');
    await loadData();

    if (!txItemsBody.children.length) {
      addTransactionItemRow();
    }
  } catch (error) {
    state.token = '';
    state.username = '';
    localStorage.removeItem('koperasi_token');
    localStorage.removeItem('koperasi_username');
    showLogin();
  }
})();
