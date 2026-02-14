/**
 * Koperasi Web — Cloudflare Worker Backend
 * Handles all /api/* routes; connects to Google Sheets via REST.
 */

import {
  getAccessTokenFromServiceAccount,
  getSpreadsheetMeta,
  addSheet,
  setHeaderRow,
  getValues,
  updateValues,
  appendValues,
  rowsToObjects,
  objectsToRows,
  formatProductsSheet,
} from './sheetsClient.mjs';

/* ===== Environment Bindings ===== */
// Cloudflare Workers expose env via the fetch(request, env) signature.
// We read from both `env` (Workers bindings) and `process.env` (nodejs_compat) as fallback.

let ENV = {};

function initEnv(workerEnv) {
  ENV = {
    SPREADSHEET_ID:
      (workerEnv && workerEnv.GOOGLE_SPREADSHEET_ID) ||
      (typeof process !== 'undefined' && process.env && process.env.GOOGLE_SPREADSHEET_ID) ||
      '',
    SERVICE_EMAIL:
      (workerEnv && (workerEnv.GOOGLE_CLIENT_EMAIL || workerEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL)) ||
      (typeof process !== 'undefined' && process.env && (process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) ||
      '',
    PRIVATE_KEY: (
      (workerEnv && workerEnv.GOOGLE_PRIVATE_KEY) ||
      (typeof process !== 'undefined' && process.env && process.env.GOOGLE_PRIVATE_KEY) ||
      ''
    ).replace(/\\n/g, '\n'),
    JWT_SECRET:
      (workerEnv && workerEnv.JWT_SECRET) ||
      (typeof process !== 'undefined' && process.env && process.env.JWT_SECRET) ||
      'dev-secret-key',
    LOGFLARE_URL:
      (workerEnv && workerEnv.LOGFLARE_URL) ||
      (typeof process !== 'undefined' && process.env && process.env.LOGFLARE_URL) ||
      '',
  };
}

/* ===== Sheet Definitions ===== */
const SHEETS = {
  admins: ['username', 'password', 'passwordHash', 'isActive'],
  products: ['id', 'name', 'sellPrice', 'buyPrice', 'stock', 'minStock', 'updatedAt'],
  transactions: ['id', 'createdAt', 'cashier', 'memberName', 'paymentMethod', 'total'],
  transaction_items: ['transactionId', 'productId', 'productName', 'qty', 'price', 'subtotal'],
  movements: ['id', 'createdAt', 'productId', 'productName', 'type', 'qty', 'balanceAfter', 'note', 'actor', 'refId'],
  notifications: ['timestamp', 'productId', 'productName', 'stock'],
};

/* ===== Helpers ===== */
function base64UrlEncode(uint8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < uint8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunk)));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  });
}

function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/* ===== Error Reporter ===== */
async function reportError(err) {
  try {
    const payload = {
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
      ts: new Date().toISOString(),
      worker: 'koperasi-web',
    };
    if (ENV.LOGFLARE_URL) {
      fetch(ENV.LOGFLARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
    console.error('[koperasi-worker]', payload);
  } catch (_) {
    /* ignore */
  }
}

/* ===== JWT Helpers (WebCrypto) ===== */
async function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 8; // 8 hours
  const fullPayload = { ...payload, iat, exp };
  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(fullPayload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ENV.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function verifyJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(ENV.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

    // Decode signature
    const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sigBinary = atob(sigPadded);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) sigBytes[i] = sigBinary.charCodeAt(i);

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
    if (!valid) return null;

    // Decode payload
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadPadded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(payloadPadded));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (_) {
    return null;
  }
}

async function verifyJwtFromHeader(req) {
  const hdr = req.headers.get('authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return null;
  return verifyJwt(token);
}

/* ===== Sheet Operations ===== */
async function ensureSheets(accessToken) {
  const meta = await getSpreadsheetMeta(ENV.SPREADSHEET_ID, accessToken);
  const existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  for (const [title, headers] of Object.entries(SHEETS)) {
    if (!existing.has(title)) {
      await addSheet(ENV.SPREADSHEET_ID, title, accessToken);
      await setHeaderRow(ENV.SPREADSHEET_ID, title, headers, accessToken);
      if (title === 'products') {
        await formatProductsSheet(ENV.SPREADSHEET_ID, title, accessToken).catch(() => {});
      }
    } else {
      const vals = await getValues(ENV.SPREADSHEET_ID, `${title}!1:1`, accessToken);
      const current = (vals.values && vals.values[0]) || [];
      const mismatch = headers.some((h, i) => current[i] !== h) || current.length !== headers.length;
      if (mismatch) {
        await setHeaderRow(ENV.SPREADSHEET_ID, title, headers, accessToken);
      }
    }
  }
}

async function getSheetObjects(title, accessToken) {
  const resp = await getValues(ENV.SPREADSHEET_ID, `${title}!A1:Z`, accessToken);
  const values = resp.values || [];
  const header = values[0] || [];
  return rowsToObjects(header, values.slice(1));
}

async function writeSheet(title, objects, accessToken) {
  const header = SHEETS[title];
  if (!header) return;
  const rows = objectsToRows(header, objects);
  const endCol = String.fromCharCode(64 + header.length);
  await updateValues(
    ENV.SPREADSHEET_ID,
    `${title}!A1:${endCol}${rows.length + 1}`,
    [header, ...rows],
    accessToken,
  );
}

/* ===== Main Handler ===== */
async function handle(request, workerEnv) {
  initEnv(workerEnv);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '').replace(/^\/+/, '');

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  try {
    // Debug — no Google auth needed
    if (path === '_debug' && request.method === 'GET') {
      return jsonResponse({
        spreadsheetId: ENV.SPREADSHEET_ID || null,
        serviceEmail: ENV.SERVICE_EMAIL || null,
        hasPrivateKey: !!ENV.PRIVATE_KEY && ENV.PRIVATE_KEY.length > 10,
      });
    }

    // Google access token (for all /api routes)
    const gtoken = await getAccessTokenFromServiceAccount(ENV.PRIVATE_KEY, ENV.SERVICE_EMAIL);
    await ensureSheets(gtoken);

    // ── Health ──
    if (path === 'api/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, message: 'Worker dan koneksi spreadsheet siap.' });
    }

    // ── Format Sheets (one-time beautify) ──
    if (path === 'api/format-sheets' && request.method === 'POST') {
      try {
        await formatProductsSheet(ENV.SPREADSHEET_ID, 'products', gtoken);
        return jsonResponse({ ok: true, message: 'Semua sheet berhasil diformat!' });
      } catch (err) {
        return jsonResponse({ ok: false, message: err.message }, 500);
      }
    }

    // ── Login ──
    if (path === 'api/login' && request.method === 'POST') {
      const body = await request.json();
      const { username, password } = body || {};
      if (!username || !password) return jsonResponse({ message: 'Username dan password wajib diisi.' }, 400);

      const admins = await getSheetObjects('admins', gtoken);
      const adminRow = admins.find(
        (r) =>
          String(r.username || '').trim() === String(username).trim() &&
          String(r.isActive || '').toLowerCase() !== 'false',
      );
      if (!adminRow) return jsonResponse({ message: 'Username atau password salah.' }, 401);

      // Support both plain password and password hash
      const passwordHash = adminRow.passwordHash || '';
      const plainPassword = adminRow.password || '';
      
      // Check plain password first, then hash
      const isValidPassword = 
        password === plainPassword || 
        (passwordHash && password === passwordHash);
      
      if (!isValidPassword) {
        return jsonResponse({ message: 'Username atau password salah.' }, 401);
      }

      const token = await signJwt({ username: adminRow.username, role: 'admin' });
      return jsonResponse({ token, username: adminRow.username });
    }

    // ── Protected Routes ──
    const protectedPrefixes = ['api/products', 'api/movements', 'api/transactions', 'api/stock-adjustments', 'api/notify-low-stock', 'api/notifications'];
    if (protectedPrefixes.some((p) => path.startsWith(p))) {
      const user = await verifyJwtFromHeader(request);
      if (!user) return jsonResponse({ message: 'Unauthorized' }, 401);

      // -- Products GET --
      if (path === 'api/products' && request.method === 'GET') {
        const products = await getSheetObjects('products', gtoken);
        return jsonResponse(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            sellPrice: Number(p.sellPrice || 0),
            buyPrice: Number(p.buyPrice || 0),
            stock: Number(p.stock || 0),
            minStock: Number(p.minStock || 0),
            updatedAt: p.updatedAt,
          })),
        );
      }

      // -- Products POST (upsert) --
      if (path === 'api/products' && request.method === 'POST') {
        const payload = await request.json();
        if (!payload.name) return jsonResponse({ message: 'Nama barang wajib diisi.' }, 400);
        const products = await getSheetObjects('products', gtoken);

        // Auto-generate short readable ID: BRG-XXXX (4 random alphanumeric)
        let id = payload.id;
        if (!id) {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code;
          do {
            code = '';
            for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
            id = `BRG-${code}`;
          } while (products.some((p) => p.id === id));
        }
        const idx = products.findIndex((r) => r.id === id);
        const now = new Date().toISOString();
        const item = {
          id,
          name: payload.name,
          sellPrice: String(payload.sellPrice || 0),
          buyPrice: String(payload.buyPrice || 0),
          stock: String(payload.stock || 0),
          minStock: String(payload.minStock || 0),
          updatedAt: now,
        };
        if (idx >= 0) products[idx] = item;
        else products.push(item);
        await writeSheet('products', products, gtoken);
        return jsonResponse(item);
      }

      // -- Movements GET --
      if (path === 'api/movements' && request.method === 'GET') {
        const movements = await getSheetObjects('movements', gtoken);
        return jsonResponse(
          movements
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 200),
        );
      }

      // -- Stock Adjustments POST --
      if (path === 'api/stock-adjustments' && request.method === 'POST') {
        const payload = await request.json();
        const { productId, type, qty, note } = payload;
        const products = await getSheetObjects('products', gtoken);
        const pidx = products.findIndex((p) => p.id === productId);
        if (pidx === -1) return jsonResponse({ message: 'Barang tidak ditemukan.' }, 400);

        const fixedQty = Number(qty || 0);
        const normalizedType = String(type).toUpperCase();
        if (!fixedQty || !['IN', 'OUT'].includes(normalizedType))
          return jsonResponse({ message: 'Payload invalid' }, 400);

        const currentStock = Number(products[pidx].stock || 0);
        const newStock = normalizedType === 'IN' ? currentStock + fixedQty : currentStock - fixedQty;
        if (newStock < 0) return jsonResponse({ message: 'Stok tidak mencukupi' }, 400);

        products[pidx].stock = String(newStock);
        products[pidx].updatedAt = new Date().toISOString();
        await writeSheet('products', products, gtoken);

        const mv = {
          id: `MV-${Date.now()}`,
          createdAt: new Date().toISOString(),
          productId,
          productName: products[pidx].name,
          type: normalizedType,
          qty: String(fixedQty),
          balanceAfter: String(newStock),
          note: note || 'Penyesuaian stok',
          actor: user.username || 'system',
          refId: '-',
        };
        const mvHeader = SHEETS['movements'];
        await appendValues(ENV.SPREADSHEET_ID, 'movements!A1', [mvHeader.map((h) => mv[h])], gtoken);
        return jsonResponse(mv);
      }

      // -- Transactions GET --
      if (path === 'api/transactions' && request.method === 'GET') {
        const [txs, items] = await Promise.all([
          getSheetObjects('transactions', gtoken),
          getSheetObjects('transaction_items', gtoken),
        ]);
        const itemsByTx = {};
        for (const it of items) {
          if (!itemsByTx[it.transactionId]) itemsByTx[it.transactionId] = [];
          itemsByTx[it.transactionId].push({
            productId: it.productId,
            productName: it.productName,
            qty: Number(it.qty || 0),
            price: Number(it.price || 0),
            subtotal: Number(it.subtotal || 0),
          });
        }
        const mapped = txs.map((t) => ({
          id: t.id,
          createdAt: t.createdAt,
          cashier: t.cashier,
          memberName: t.memberName,
          paymentMethod: t.paymentMethod,
          total: Number(t.total || 0),
          items: itemsByTx[t.id] || [],
        }));
        return jsonResponse(
          mapped.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100),
        );
      }

      // -- Transactions POST --
      if (path === 'api/transactions' && request.method === 'POST') {
        const payload = await request.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) return jsonResponse({ message: 'Minimal 1 item transaksi' }, 400);

        const products = await getSheetObjects('products', gtoken);
        let total = 0;
        const normalized = [];

        for (const it of items) {
          const prod = products.find((p) => p.id === it.productId);
          if (!prod) return jsonResponse({ message: `Barang ${it.productId} tidak ditemukan` }, 400);
          const qty = Number(it.qty || 0);
          if (qty <= 0) return jsonResponse({ message: 'qty invalid' }, 400);
          if (Number(prod.stock || 0) < qty)
            return jsonResponse({ message: `Stok tidak cukup untuk ${prod.name}` }, 400);
          const price = Number(prod.sellPrice || 0);
          const subtotal = price * qty;
          total += subtotal;
          normalized.push({ prod, qty, price, subtotal });
        }

        const txId = `TRX-${Date.now()}`;
        const now = new Date().toISOString();

        // Update stock + movements
        for (const n of normalized) {
          const idx = products.findIndex((p) => p.id === n.prod.id);
          const newStock = Number(products[idx].stock || 0) - n.qty;
          products[idx].stock = String(newStock);
          products[idx].updatedAt = now;
          const mv = [
            `MV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            now,
            n.prod.id,
            n.prod.name,
            'OUT',
            String(n.qty),
            String(newStock),
            `Penjualan ${txId}`,
            user.username || 'system',
            txId,
          ];
          await appendValues(ENV.SPREADSHEET_ID, 'movements!A1', [mv], gtoken);
        }

        await writeSheet('products', products, gtoken);

        // Append transaction
        await appendValues(
          ENV.SPREADSHEET_ID,
          'transactions!A1',
          [[txId, now, user.username || 'system', payload.memberName || '-', payload.paymentMethod || 'cash', String(total)]],
          gtoken,
        );

        // Append items
        for (const n of normalized) {
          await appendValues(
            ENV.SPREADSHEET_ID,
            'transaction_items!A1',
            [[txId, n.prod.id, n.prod.name, String(n.qty), String(n.price), String(n.subtotal)]],
            gtoken,
          );
        }

        // Low-stock notifications
        const lowAfter = products.filter((p) => Number(p.stock || 0) <= Number(p.minStock || 0));
        for (const p of lowAfter) {
          await appendValues(
            ENV.SPREADSHEET_ID,
            'notifications!A1',
            [[new Date().toISOString(), p.id, p.name, p.stock]],
            gtoken,
          ).catch(() => {});
        }

        return jsonResponse({
          id: txId,
          memberName: payload.memberName || '-',
          paymentMethod: payload.paymentMethod || 'cash',
          total,
          items: normalized.map((x) => ({
            productId: x.prod.id,
            productName: x.prod.name,
            qty: x.qty,
            price: x.price,
            subtotal: x.subtotal,
          })),
        });
      }

      // -- Notify Low Stock POST --
      if (path === 'api/notify-low-stock' && request.method === 'POST') {
        const products = await getSheetObjects('products', gtoken);
        const low = products.filter((p) => Number(p.stock || 0) <= Number(p.minStock || 0));
        if (!low.length) return jsonResponse({ ok: true, message: 'Tidak ada produk stok rendah.' });
        for (const p of low) {
          await appendValues(
            ENV.SPREADSHEET_ID,
            'notifications!A1',
            [[new Date().toISOString(), p.id, p.name, p.stock]],
            gtoken,
          ).catch(() => {});
        }
        return jsonResponse({ ok: true, count: low.length, items: low });
      }

      // -- Notifications GET --
      if (path === 'api/notifications' && request.method === 'GET') {
        const nots = await getSheetObjects('notifications', gtoken).catch(() => []);
        return jsonResponse(nots.slice(0, 200));
      }
    }

    // Fallback 404
    return jsonResponse({ message: 'Not found' }, 404);
  } catch (err) {
    reportError(err);
    return jsonResponse({ message: err.message || String(err) }, 500);
  }
}

/* ===== Worker Entry Point ===== */
export default {
  fetch(request, env, ctx) {
    return handle(request, env);
  },
};
