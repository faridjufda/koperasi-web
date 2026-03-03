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
  clearValues,
  rowsToObjects,
  objectsToRows,
  formatProductsSheet,
} from './sheetsClient.mjs';
import { callGemini } from './geminiClient.mjs';

/* ===== Environment Bindings ===== */
// Cloudflare Workers expose env via the fetch(request, env) signature.
// We read from both `env` (Workers bindings) and `process.env` (nodejs_compat) as fallback.

let ENV = {};

/* ===== Allowed Origins for CORS ===== */
const ALLOWED_ORIGINS = [
  'https://koperasi-web.pages.dev',
  'https://koperasi-web-prod.kmbpendidikanekonomi.workers.dev',
  'http://localhost:8788',
  'http://localhost:3000',
  'http://127.0.0.1:8788',
];
// Also allow *.koperasi-web.pages.dev (preview deployments)
function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9]+\.koperasi-web\.pages\.dev$/.test(origin)) return true;
  return false;
}

/* ===== Rate Limiter (in-memory, per-IP) ===== */
const loginAttempts = new Map(); // IP -> { count, resetAt }
const RATE_LIMIT_MAX = 5;        // max attempts
const RATE_LIMIT_WINDOW = 300;   // 5 minutes in seconds

function checkRateLimit(ip) {
  const now = Math.floor(Date.now() / 1000);
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true; // allowed
  }
  if (entry.count >= RATE_LIMIT_MAX) return false; // blocked
  entry.count++;
  return true;
}
function resetRateLimit(ip) { loginAttempts.delete(ip); }
// Periodic cleanup (prevent memory leak)
function cleanupRateLimits() {
  const now = Math.floor(Date.now() / 1000);
  for (const [ip, entry] of loginAttempts) {
    if (entry.resetAt < now) loginAttempts.delete(ip);
  }
}

function initEnv(workerEnv) {
  const jwtSecret =
    (workerEnv && workerEnv.JWT_SECRET) ||
    (typeof process !== 'undefined' && process.env && process.env.JWT_SECRET) ||
    '';
  if (!jwtSecret) {
    throw new Error('FATAL: JWT_SECRET is not configured. Set it via wrangler secret.');
  }
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
    JWT_SECRET: jwtSecret,
    LOGFLARE_URL:
      (workerEnv && workerEnv.LOGFLARE_URL) ||
      (typeof process !== 'undefined' && process.env && process.env.LOGFLARE_URL) ||
      '',
    GEMINI_API_KEY:
      (workerEnv && workerEnv.GEMINI_API_KEY) ||
      (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) ||
      '',
    GEMINI_MODEL:
      (workerEnv && workerEnv.GEMINI_MODEL) ||
      (typeof process !== 'undefined' && process.env && process.env.GEMINI_MODEL) ||
      'gemini-2.0-flash',
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

// WITA (Indonesia Tengah) timezone offset: UTC+8
function nowWITA() {
  const now = new Date();
  // Format: YYYY-MM-DD HH:mm:ss WITA
  return now.toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' }).replace('T', ' ') + ' WITA';
}

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

/* ===== Input Sanitization ===== */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>"'`]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;' }[c]))
    .trim()
    .slice(0, 500); // max 500 chars
}
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = typeof v === 'string' ? sanitize(v) : v;
  }
  return clean;
}

/* ===== Security Headers ===== */
function securityHeaders(origin) {
  const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

let _currentOrigin = '';

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...securityHeaders(_currentOrigin),
      ...extraHeaders,
    },
  });
}

function corsPreflightResponse(origin) {
  const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/* ===== Error Reporter ===== */
async function reportError(err) {
  try {
    const payload = {
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
      ts: nowWITA(),
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
  const exp = iat + 60 * 60 * 4; // 4 hours (reduced for security)
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

/* ===== Password Hashing (SHA-256) ===== */
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + ':koperasi-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Set current origin for CORS headers
  _currentOrigin = request.headers.get('Origin') || '';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return corsPreflightResponse(_currentOrigin);
  }

  // Periodic cleanup of rate limits
  cleanupRateLimits();

  try {
    // Debug — ONLY with valid auth token
    if (path === '_debug' && request.method === 'GET') {
      const dbgUser = await verifyJwtFromHeader(request);
      if (!dbgUser) return jsonResponse({ message: 'Unauthorized' }, 401);
      return jsonResponse({
        spreadsheetId: ENV.SPREADSHEET_ID ? '***set***' : null,
        serviceEmail: ENV.SERVICE_EMAIL ? ENV.SERVICE_EMAIL.slice(0, 10) + '...' : null,
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

    // ── Format Sheets (one-time beautify) — PROTECTED ──
    if (path === 'api/format-sheets' && request.method === 'POST') {
      const fmtUser = await verifyJwtFromHeader(request);
      if (!fmtUser) return jsonResponse({ message: 'Unauthorized' }, 401);
      try {
        await formatProductsSheet(ENV.SPREADSHEET_ID, 'products', gtoken);
        return jsonResponse({ ok: true, message: 'Semua sheet berhasil diformat!' });
      } catch (err) {
        return jsonResponse({ ok: false, message: err.message }, 500);
      }
    }

    // ── Login ──
    if (path === 'api/login' && request.method === 'POST') {
      // Rate limiting by IP
      const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      if (!checkRateLimit(clientIP)) {
        return jsonResponse({ message: 'Terlalu banyak percobaan login. Coba lagi dalam 5 menit.' }, 429);
      }

      const body = await request.json();
      const { username, password } = body || {};
      if (!username || !password) return jsonResponse({ message: 'Username dan password wajib diisi.' }, 400);
      if (typeof username !== 'string' || typeof password !== 'string') return jsonResponse({ message: 'Input invalid.' }, 400);
      if (username.length > 100 || password.length > 200) return jsonResponse({ message: 'Input terlalu panjang.' }, 400);

      const admins = await getSheetObjects('admins', gtoken);
      const trimmedUsername = String(username).trim();
      const adminRow = admins.find(
        (r) =>
          String(r.username || '').trim() === trimmedUsername &&
          String(r.isActive || '').toLowerCase() !== 'false',
      );
      // Use constant-time-ish comparison to prevent timing attacks
      if (!adminRow) {
        // Still hash to prevent timing leaks
        await hashPassword('dummy-password-for-timing');
        return jsonResponse({ message: 'Username atau password salah.' }, 401);
      }

      // Compare password securely with SHA-256 hash
      const plainPassword = adminRow.password || '';
      const storedHash = adminRow.passwordHash || '';
      
      // Check plain password match, then upgrade to hash
      const inputHash = await hashPassword(password);
      const plainHash = plainPassword ? await hashPassword(plainPassword) : '';
      
      const isValidPassword = 
        (plainPassword && inputHash === plainHash) ||
        (storedHash && inputHash === storedHash);
      
      if (!isValidPassword) {
        return jsonResponse({ message: 'Username atau password salah.' }, 401);
      }

      // Auto-upgrade: store SHA-256 hash if not present
      if (!storedHash && plainPassword) {
        try {
          const idx = admins.findIndex(a => String(a.username || '').trim() === trimmedUsername);
          if (idx >= 0) {
            admins[idx].passwordHash = inputHash;
            await writeSheet('admins', admins, gtoken);
          }
        } catch (_e) { /* non-critical */ }
      }

      // Reset rate limit on successful login
      resetRateLimit(clientIP);

      const token = await signJwt({ username: adminRow.username, role: 'admin' });
      return jsonResponse({ token, username: adminRow.username });
    }

    // ── Protected Routes ──
    const protectedPrefixes = ['api/products', 'api/movements', 'api/transactions', 'api/stock-adjustments', 'api/notify-low-stock', 'api/notifications', 'api/gemini', 'api/analisis-bulanan', 'api/prediksi-stok'];
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
        const rawPayload = await request.json();
        const payload = sanitizeObject(rawPayload);
        if (!payload.name) return jsonResponse({ message: 'Nama barang wajib diisi.' }, 400);
        if (String(payload.name).length > 200) return jsonResponse({ message: 'Nama barang terlalu panjang.' }, 400);
        if (Number(payload.sellPrice) < 0 || Number(payload.buyPrice) < 0) return jsonResponse({ message: 'Harga tidak boleh negatif.' }, 400);
        if (Number(payload.stock) < 0) return jsonResponse({ message: 'Stok tidak boleh negatif.' }, 400);
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
        const now = nowWITA();
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
        const rawPayload = await request.json();
        const payload = sanitizeObject(rawPayload);
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
        products[pidx].updatedAt = nowWITA();
        await writeSheet('products', products, gtoken);

        const mv = {
          id: `MV-${Date.now()}`,
          createdAt: nowWITA(),
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
        const rawPayload = await request.json();
        const payload = sanitizeObject(rawPayload);
        const items = Array.isArray(rawPayload.items) ? rawPayload.items : [];
        if (!items.length) return jsonResponse({ message: 'Minimal 1 item transaksi' }, 400);
        if (items.length > 50) return jsonResponse({ message: 'Maksimal 50 item per transaksi' }, 400);

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
        const now = nowWITA();

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
            [[nowWITA(), p.id, p.name, p.stock]],
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
            [[nowWITA(), p.id, p.name, p.stock]],
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

      // -- Gemini Generate (protected) --
      if (path === 'api/gemini' && request.method === 'POST') {
        if (!ENV.GEMINI_API_KEY) return jsonResponse({ message: 'Gemini belum dikonfigurasi pada Worker.' }, 500);
        const body = await request.json().catch(() => ({}));
        const prompt = body.prompt || body.input || '';
        if (!prompt) return jsonResponse({ message: 'Field "prompt" wajib diisi.' }, 400);
        const model = body.model || ENV.GEMINI_MODEL || 'gemini-1.0';
        const opts = { temperature: body.temperature, maxOutputTokens: body.maxOutputTokens };
        try {
          const gresp = await callGemini(ENV.GEMINI_API_KEY, model, prompt, opts);
          // gresp: { raw, text }
          return jsonResponse({ ok: true, text: gresp.text, raw: gresp.raw });
        } catch (err) {
          return jsonResponse({ ok: false, message: err.message || String(err) }, 500);
        }
      }

      // -- Analisis Bulanan (protected) --
      if (path === 'api/analisis-bulanan' && request.method === 'GET') {
        const urlp = new URL(request.url);
        const month = Number(urlp.searchParams.get('month')) || null;
        const year = Number(urlp.searchParams.get('year')) || null;
        const top_n = Number(urlp.searchParams.get('top_n')) || 5;
        if (!month || !year) return jsonResponse({ message: 'month and year query params required' }, 400);

        const txs = await getSheetObjects('transactions', gtoken).catch(() => []);
        const items = await getSheetObjects('transaction_items', gtoken).catch(() => []);

        function parseDateString(s) {
          if (!s) return null;
          let t = String(s).replace(' WITA', '').trim();
          // Try replacing space with T for ISO parse
          t = t.replace(' ', 'T');
          const d = new Date(t);
          if (!isNaN(d.getTime())) return d;
          // fallback try common formats
          try {
            return new Date(String(s).replace(' ', 'T'));
          } catch (e) {
            return null;
          }
        }

        const validTx = new Set();
        for (const t of txs) {
          const created = parseDateString(t.createdAt || t.created_at || t.created || '');
          if (!created) continue;
          if (created.getUTCMonth() + 1 === month && created.getUTCFullYear() === year) {
            const tid = t.id || t.transactionId || t.transaction_id || t.txId;
            if (tid) validTx.add(String(tid));
          }
        }

        const agg = {}; let total_qty = 0; let total_revenue = 0;
        for (const it of items) {
          const tid = String(it.transactionId || it.transactionId || it.transaction_id || it.trxId || it.id || '');
          if (!validTx.has(tid)) continue;
          const pid = it.productId || it.product_id || it.product || '';
          const pname = it.productName || it.product_name || pid;
          let qty = Number(it.qty || it.quantity || 0) || 0;
          let price = Number(it.subtotal || it.price || 0) || 0;
          total_qty += qty;
          total_revenue += price;
          const key = `${pid}|${pname}`;
          if (!agg[key]) agg[key] = { productId: pid, productName: pname, qty: 0, revenue: 0 };
          agg[key].qty += qty;
          agg[key].revenue += price;
        }

        const items_list = Object.values(agg).sort((a,b)=>b.qty-a.qty);
        const top = items_list.slice(0, top_n);
        const slow = items_list.filter(i=>i.qty>0).sort((a,b)=>a.qty-b.qty).slice(0, top_n);

        const products = await getSheetObjects('products', gtoken).catch(()=>[]);
        const stockMap = {};
        for (const p of products) stockMap[String(p.id || p.ID || p.Id || '')] = p;

        const recs = [];
        for (const it of items_list) {
          const pid = String(it.productId || '');
          const prod = stockMap[pid];
          if (!prod) continue;
          const stock = Number(prod.stock || prod.stock || 0) || 0;
          const minStock = Number(prod.minStock || prod.min_stock || 0) || 0;
          if (stock <= minStock) recs.push({ productId: pid, productName: it.productName, stock, minStock, reason: 'stock <= minStock' });
        }

        return jsonResponse({ month, year, total_qty, total_revenue, top, slow, recommendations: recs });
      }

      // -- Prediksi Stok (protected) --
      if (path === 'api/prediksi-stok' && request.method === 'GET') {
        // expecting url like /api/prediksi-stok?nama=...&days=90
        const urlp = new URL(request.url);
        const nama = urlp.searchParams.get('nama') || '';
        const days = Number(urlp.searchParams.get('days')) || 90;
        if (!nama) return jsonResponse({ message: 'query param nama required' }, 400);

        const prod = (await getSheetObjects('products', gtoken).catch(()=>[])).find(p=>String(p.name||'').trim().toLowerCase()===String(nama).trim().toLowerCase());
        if (!prod) return jsonResponse({ message: 'Produk tidak ditemukan' }, 404);
        const stock = Number(prod.stock || 0) || 0;

        const txs = await getSheetObjects('transactions', gtoken).catch(()=>[]);
        const items = await getSheetObjects('transaction_items', gtoken).catch(()=>[]);

        function parseDateString(s) {
          if (!s) return null;
          let t = String(s).replace(' WITA', '').trim();
          t = t.replace(' ', 'T');
          const d = new Date(t);
          if (!isNaN(d.getTime())) return d;
          try { return new Date(String(s).replace(' ', 'T')); } catch(e) { return null; }
        }

        const now = Date.now();
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        const validTx = new Set();
        for (const t of txs) {
          const created = parseDateString(t.createdAt || t.created_at || t.created || '');
          if (!created) continue;
          if (created.getTime() >= cutoff) {
            const tid = t.id || t.transactionId || t.transaction_id || t.txId;
            if (tid) validTx.add(String(tid));
          }
        }

        let total_qty = 0;
        for (const it of items) {
          const tid = String(it.transactionId || it.transaction_id || it.trxId || it.id || '');
          if (!validTx.has(tid)) continue;
          const pname = String(it.productName || it.product_name || '');
          if (pname.trim().toLowerCase() !== nama.trim().toLowerCase()) continue;
          const q = Number(it.qty || it.quantity || 0) || 0;
          total_qty += q;
        }

        const avg_per_day = days > 0 ? (total_qty / days) : 0;
        let days_left = null;
        let estimated_empty_date = null;
        if (avg_per_day > 0) {
          days_left = Math.floor(stock / avg_per_day);
          estimated_empty_date = new Date(Date.now() + days_left * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
        }

        return jsonResponse({ product: prod, stock, window_days: days, total_sold_in_window: total_qty, avg_per_day, days_left, estimated_empty_date });
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
