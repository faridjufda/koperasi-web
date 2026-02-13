const bcrypt = require('bcryptjs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const SHEETS = {
  ADMINS: {
    title: 'admins',
    headers: ['username', 'passwordHash', 'isActive'],
  },
  PRODUCTS: {
    title: 'products',
    headers: ['id', 'name', 'sellPrice', 'buyPrice', 'stock', 'minStock', 'updatedAt'],
  },
  TRANSACTIONS: {
    title: 'transactions',
    headers: ['id', 'createdAt', 'cashier', 'memberName', 'paymentMethod', 'total'],
  },
  TRANSACTION_ITEMS: {
    title: 'transaction_items',
    headers: ['transactionId', 'productId', 'productName', 'qty', 'price', 'subtotal'],
  },
  MOVEMENTS: {
    title: 'movements',
    headers: ['id', 'createdAt', 'productId', 'productName', 'type', 'qty', 'balanceAfter', 'note', 'actor', 'refId'],
  },
};

let initialized = false;
let doc;

function mustEnv(value, name) {
  if (!value) {
    throw new Error(`${name} belum diatur di .env`);
  }
}

function toNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function nowIso() {
  return new Date().toISOString();
}

async function getDoc() {
  if (doc) {
    return doc;
  }

  mustEnv(spreadsheetId, 'GOOGLE_SPREADSHEET_ID');
  mustEnv(serviceEmail, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  mustEnv(privateKey, 'GOOGLE_PRIVATE_KEY');

  const auth = new JWT({
    email: serviceEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();
  return doc;
}

async function getOrCreateSheet(title, headers) {
  const currentDoc = await getDoc();
  let sheet = currentDoc.sheetsByTitle[title];

  if (!sheet) {
    sheet = await currentDoc.addSheet({ title, headerValues: headers });
    return sheet;
  }

  await sheet.loadHeaderRow();
  const existingHeaders = sheet.headerValues || [];
  const mismatch = headers.some((header, index) => existingHeaders[index] !== header);
  if (mismatch || existingHeaders.length !== headers.length) {
    await sheet.setHeaderRow(headers);
  }

  return sheet;
}

async function ensureSheets() {
  const defs = Object.values(SHEETS);
  for (const def of defs) {
    await getOrCreateSheet(def.title, def.headers);
  }
}

async function initSheets() {
  if (initialized) {
    return;
  }

  await ensureSheets();
  initialized = true;
}

async function getSheet(def) {
  await initSheets();
  return getOrCreateSheet(def.title, def.headers);
}

async function authenticateAdmin(username, password) {
  const sheet = await getSheet(SHEETS.ADMINS);
  const rows = await sheet.getRows();

  const adminRow = rows.find((row) => {
    const activeRaw = String(row.get('isActive') || 'true').toLowerCase();
    const isActive = activeRaw !== 'false' && activeRaw !== '0' && activeRaw !== 'no';
    return row.get('username') === username && isActive;
  });

  if (!adminRow) {
    return null;
  }

  const passwordHash = adminRow.get('passwordHash') || '';
  const ok = await bcrypt.compare(password, passwordHash);
  return ok ? { username: adminRow.get('username') } : null;
}

async function createOrUpdateAdmin(username, password, isActive = true) {
  if (!username || !password) {
    throw new Error('Username dan password wajib diisi.');
  }

  const sheet = await getSheet(SHEETS.ADMINS);
  const rows = await sheet.getRows();
  const existing = rows.find((row) => row.get('username') === username);
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    existing.set('passwordHash', passwordHash);
    existing.set('isActive', String(Boolean(isActive)));
    await existing.save();
    return { username, updated: true };
  }

  await sheet.addRow({
    username,
    passwordHash,
    isActive: String(Boolean(isActive)),
  });

  return { username, updated: false };
}

async function listProducts() {
  const sheet = await getSheet(SHEETS.PRODUCTS);
  const rows = await sheet.getRows();

  return rows.map((row) => ({
    id: row.get('id'),
    name: row.get('name'),
    sellPrice: toNumber(row.get('sellPrice')),
    buyPrice: toNumber(row.get('buyPrice')),
    stock: toNumber(row.get('stock')),
    minStock: toNumber(row.get('minStock')),
    updatedAt: row.get('updatedAt'),
  }));
}

async function upsertProduct(payload, actor = 'system') {
  const { id, name, sellPrice, buyPrice, stock, minStock } = payload;

  if (!name) {
    throw new Error('Nama barang wajib diisi.');
  }

  const fixedId = id || `PRD-${Date.now()}`;
  const fixedSellPrice = toNumber(sellPrice);
  const fixedBuyPrice = toNumber(buyPrice);
  const fixedStock = toNumber(stock);
  const fixedMinStock = toNumber(minStock);

  if (fixedSellPrice < 0 || fixedBuyPrice < 0 || fixedStock < 0 || fixedMinStock < 0) {
    throw new Error('Nilai harga/stok tidak boleh negatif.');
  }

  const sheet = await getSheet(SHEETS.PRODUCTS);
  const rows = await sheet.getRows();
  const existing = rows.find((row) => row.get('id') === fixedId);

  if (existing) {
    existing.set('name', name);
    existing.set('sellPrice', fixedSellPrice);
    existing.set('buyPrice', fixedBuyPrice);
    existing.set('stock', fixedStock);
    existing.set('minStock', fixedMinStock);
    existing.set('updatedAt', nowIso());
    await existing.save();
  } else {
    await sheet.addRow({
      id: fixedId,
      name,
      sellPrice: fixedSellPrice,
      buyPrice: fixedBuyPrice,
      stock: fixedStock,
      minStock: fixedMinStock,
      updatedAt: nowIso(),
    });

    const movementSheet = await getSheet(SHEETS.MOVEMENTS);
    await movementSheet.addRow({
      id: `MV-${Date.now()}`,
      createdAt: nowIso(),
      productId: fixedId,
      productName: name,
      type: 'IN',
      qty: fixedStock,
      balanceAfter: fixedStock,
      note: 'Stok awal barang baru',
      actor,
      refId: '-',
    });
  }

  return {
    id: fixedId,
    name,
    sellPrice: fixedSellPrice,
    buyPrice: fixedBuyPrice,
    stock: fixedStock,
    minStock: fixedMinStock,
  };
}

async function createStockAdjustment(payload, actor = 'system') {
  const { productId, type, qty, note } = payload;
  const fixedQty = toNumber(qty);

  if (!productId || !type || !fixedQty) {
    throw new Error('productId, type, dan qty wajib diisi.');
  }

  const normalizedType = String(type).toUpperCase();
  if (!['IN', 'OUT'].includes(normalizedType)) {
    throw new Error('type harus IN atau OUT.');
  }

  if (fixedQty <= 0) {
    throw new Error('qty harus lebih dari 0.');
  }

  const productSheet = await getSheet(SHEETS.PRODUCTS);
  const productRows = await productSheet.getRows();
  const product = productRows.find((row) => row.get('id') === productId);

  if (!product) {
    throw new Error('Barang tidak ditemukan.');
  }

  const currentStock = toNumber(product.get('stock'));
  const newStock = normalizedType === 'IN' ? currentStock + fixedQty : currentStock - fixedQty;

  if (newStock < 0) {
    throw new Error('Stok tidak mencukupi untuk pengurangan.');
  }

  product.set('stock', newStock);
  product.set('updatedAt', nowIso());
  await product.save();

  const movementSheet = await getSheet(SHEETS.MOVEMENTS);
  const movementId = `MV-${Date.now()}`;

  await movementSheet.addRow({
    id: movementId,
    createdAt: nowIso(),
    productId,
    productName: product.get('name'),
    type: normalizedType,
    qty: fixedQty,
    balanceAfter: newStock,
    note: note || 'Penyesuaian stok',
    actor,
    refId: '-',
  });

  return {
    id: movementId,
    productId,
    type: normalizedType,
    qty: fixedQty,
    balanceAfter: newStock,
  };
}

async function listMovements() {
  const sheet = await getSheet(SHEETS.MOVEMENTS);
  const rows = await sheet.getRows();

  return rows
    .map((row) => ({
      id: row.get('id'),
      createdAt: row.get('createdAt'),
      productId: row.get('productId'),
      productName: row.get('productName'),
      type: row.get('type'),
      qty: toNumber(row.get('qty')),
      balanceAfter: toNumber(row.get('balanceAfter')),
      note: row.get('note'),
      actor: row.get('actor'),
      refId: row.get('refId'),
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 200);
}

async function listTransactions() {
  const txSheet = await getSheet(SHEETS.TRANSACTIONS);
  const itemSheet = await getSheet(SHEETS.TRANSACTION_ITEMS);

  const txRows = await txSheet.getRows();
  const itemRows = await itemSheet.getRows();

  const itemsByTx = itemRows.reduce((acc, row) => {
    const txId = row.get('transactionId');
    if (!acc[txId]) {
      acc[txId] = [];
    }

    acc[txId].push({
      productId: row.get('productId'),
      productName: row.get('productName'),
      qty: toNumber(row.get('qty')),
      price: toNumber(row.get('price')),
      subtotal: toNumber(row.get('subtotal')),
    });

    return acc;
  }, {});

  return txRows
    .map((row) => {
      const id = row.get('id');
      return {
        id,
        createdAt: row.get('createdAt'),
        cashier: row.get('cashier'),
        memberName: row.get('memberName'),
        paymentMethod: row.get('paymentMethod'),
        total: toNumber(row.get('total')),
        items: itemsByTx[id] || [],
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100);
}

async function createTransaction(payload, actor = 'system') {
  const memberName = payload.memberName || '-';
  const paymentMethod = payload.paymentMethod || 'cash';
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    throw new Error('Minimal 1 item transaksi diperlukan.');
  }

  const productSheet = await getSheet(SHEETS.PRODUCTS);
  const txSheet = await getSheet(SHEETS.TRANSACTIONS);
  const txItemSheet = await getSheet(SHEETS.TRANSACTION_ITEMS);
  const movementSheet = await getSheet(SHEETS.MOVEMENTS);

  const productRows = await productSheet.getRows();
  let total = 0;
  const normalizedItems = [];

  for (const item of items) {
    const productId = item.productId;
    const qty = toNumber(item.qty);

    if (!productId || qty <= 0) {
      throw new Error('Setiap item harus memiliki productId dan qty > 0.');
    }

    const product = productRows.find((row) => row.get('id') === productId);
    if (!product) {
      throw new Error(`Barang dengan ID ${productId} tidak ditemukan.`);
    }

    const stock = toNumber(product.get('stock'));
    if (qty > stock) {
      throw new Error(`Stok tidak cukup untuk ${product.get('name')}.`);
    }

    const price = toNumber(product.get('sellPrice'));
    const subtotal = price * qty;
    total += subtotal;

    normalizedItems.push({
      product,
      productId,
      productName: product.get('name'),
      qty,
      price,
      subtotal,
    });
  }

  const transactionId = `TRX-${Date.now()}`;

  for (const item of normalizedItems) {
    const currentStock = toNumber(item.product.get('stock'));
    const newStock = currentStock - item.qty;
    item.product.set('stock', newStock);
    item.product.set('updatedAt', nowIso());
    await item.product.save();

    await movementSheet.addRow({
      id: `MV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: nowIso(),
      productId: item.productId,
      productName: item.productName,
      type: 'OUT',
      qty: item.qty,
      balanceAfter: newStock,
      note: `Penjualan ${transactionId}`,
      actor,
      refId: transactionId,
    });
  }

  await txSheet.addRow({
    id: transactionId,
    createdAt: nowIso(),
    cashier: actor,
    memberName,
    paymentMethod,
    total,
  });

  for (const item of normalizedItems) {
    await txItemSheet.addRow({
      transactionId,
      productId: item.productId,
      productName: item.productName,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal,
    });
  }

  return {
    id: transactionId,
    memberName,
    paymentMethod,
    total,
    items: normalizedItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal,
    })),
  };
}

module.exports = {
  initSheets,
  authenticateAdmin,
  createOrUpdateAdmin,
  listProducts,
  upsertProduct,
  createStockAdjustment,
  listMovements,
  listTransactions,
  createTransaction,
};
