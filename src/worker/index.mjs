
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
} from './sheetsClient.mjs';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

const SHEETS = {
  admins: ['username', 'passwordHash', 'isActive'],
  products: ['id', 'name', 'sellPrice', 'buyPrice', 'stock', 'minStock', 'updatedAt'],
  transactions: ['id', 'createdAt', 'cashier', 'memberName', 'paymentMethod', 'total'],
  transaction_items: ['transactionId', 'productId', 'productName', 'qty', 'price', 'subtotal'],
  movements: ['id', 'createdAt', 'productId', 'productName', 'type', 'qty', 'balanceAfter', 'note', 'actor', 'refId'],
};

async function ensureSheets(accessToken) {
  const meta = await getSpreadsheetMeta(SPREADSHEET_ID, accessToken);
  const existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  for (const [title, headers] of Object.entries(SHEETS)) {
    if (!existing.has(title)) {
      await addSheet(SPREADSHEET_ID, title, accessToken);
      await setHeaderRow(SPREADSHEET_ID, title, headers, accessToken);
      // apply sheet-specific formatting (products gets extra formatting)
      if (title === 'products') {
        await formatProductsSheet(SPREADSHEET_ID, title, accessToken).catch(()=>{});
      }
    } else {
      // ensure header exists (best-effort)
      const vals = await getValues(SPREADSHEET_ID, `${title}!1:1`, accessToken);
      const current = (vals.values && vals.values[0]) || [];
      const mismatch = headers.some((h, i) => current[i] !== h) || current.length !== headers.length;
      if (mismatch) {
        await setHeaderRow(SPREADSHEET_ID, title, headers, accessToken);
      }
    }
  }
}

async function getSheetObjects(title, accessToken) {
  const range = `${title}!A1:Z`;
  const resp = await getValues(SPREADSHEET_ID, range, accessToken);
  const values = resp.values || [];
  const header = values[0] || [];
  const rows = values.slice(1);
  return rowsToObjects(header, rows);
}

async function writeSheetObjects(title, objects, accessToken) {
  const header = SHEETS[title];
  const rows = objectsToRows(header, objects);
  await updateValues(SPREADSHEET_ID, `${title}!A1:${String.fromCharCode(64 + header.length)}${rows.length + 1}`, [header, ...rows], accessToken);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

async function verifyJwtFromHeader(req) {
  const hdr = req.headers.get('authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return payload;
  } catch (e) {
    return null;
  }
}

async function handle(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$|^\/+/, ''); // trim slashes

    // Lightweight debug route — do NOT require Google auth
    if (path === '_debug' && req.method === 'GET') {
      return jsonResponse({
        spreadsheetId: SPREADSHEET_ID || null,
        serviceEmail: SERVICE_EMAIL || null,
        hasPrivateKey: !!PRIVATE_KEY && PRIVATE_KEY.length > 10,
      });
    }

    // obtain Google access token (only for actual API routes)
    const gtoken = await getAccessTokenFromServiceAccount(PRIVATE_KEY, SERVICE_EMAIL);
    await ensureSheets(gtoken);

    // ROUTES
    if (path === 'api/health' && req.method === 'GET') {
      return jsonResponse({ ok: true, message: 'Worker dan koneksi spreadsheet siap.' });
    }

    if (path === '_debug' && req.method === 'GET') {
      return jsonResponse({
        spreadsheetId: SPREADSHEET_ID || null,
        serviceEmail: SERVICE_EMAIL || null,
        hasPrivateKey: !!PRIVATE_KEY && PRIVATE_KEY.length > 10,
      });
    }

    if (path === 'api/login' && req.method === 'POST') {
      const body = await req.json();
      const { username, password } = body || {};
      if (!username || !password) return jsonResponse({ message: 'Username dan password wajib diisi.' }, 400);

      const admins = await getSheetObjects('admins', gtoken);
      const adminRow = admins.find((r) => String((r.username || '')).trim() === String(username).trim() && String((r.isActive || '')).toLowerCase() !== 'false');
      if (!adminRow) return jsonResponse({ message: 'Username atau password salah.' }, 401);

      const passwordHash = adminRow.passwordHash || '';
      // For Workers we accept plain-match during migration (admin should be created via server create-admin)
      if (password === passwordHash || passwordHash === '' ) {
        // sign token (HS256) using Web Crypto
        const header = { alg: 'HS256', typ: 'JWT' };
        const iat = Math.floor(Date.now()/1000);
        const exp = iat + 60 * 60 * 8;
        const payload = { username: adminRow.username, role: 'admin', iat, exp };
        const tokenUnsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(tokenUnsigned));
        const signature = base64UrlEncode(new Uint8Array(sig));
        const token = `${tokenUnsigned}.${signature}`;
        return jsonResponse({ token, username: adminRow.username });
      }

      return jsonResponse({ message: 'Username atau password salah.' }, 401);
    }

    // Protected routes helper
    const protectedPaths = ['api/products', 'api/movements', 'api/transactions', 'api/stock-adjustments', 'api/products'];
    if (protectedPaths.some((p) => path.startsWith(p))) {
      const user = await verifyJwtFromHeader(req);
      if (!user) return jsonResponse({ message: 'Unauthorized' }, 401);

      // products GET
      if (path === 'api/products' && req.method === 'GET') {
        const products = await getSheetObjects('products', gtoken);
        return jsonResponse(products.map((p) => ({ id: p.id, name: p.name, sellPrice: Number(p.sellPrice||0), buyPrice: Number(p.buyPrice||0), stock: Number(p.stock||0), minStock: Number(p.minStock||0), updatedAt: p.updatedAt })));
      }

      // products POST (upsert)
      if (path === 'api/products' && req.method === 'POST') {
        const payload = await req.json();
        const products = await getSheetObjects('products', gtoken);
        const id = payload.id || `PRD-${Date.now()}`;
        const idx = products.findIndex((r) => r.id === id);
        const now = new Date().toISOString();
        const item = { id, name: payload.name, sellPrice: String(payload.sellPrice||0), buyPrice: String(payload.buyPrice||0), stock: String(payload.stock||0), minStock: String(payload.minStock||0), updatedAt: now };
        if (idx >= 0) products[idx] = item; else products.push(item);
        // write back whole sheet (simple strategy)
        const header = SHEETS['products'];
        const rows = objectsToRows(header, products);
        await updateValues(SPREADSHEET_ID, `products!A1:${String.fromCharCode(64 + header.length)}${rows.length + 1}`, [header, ...rows], gtoken);
        return jsonResponse(item);
      }

      // movements GET
      if (path === 'api/movements' && req.method === 'GET') {
        const movements = await getSheetObjects('movements', gtoken);
        return jsonResponse(movements.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,200));
      }

      // stock-adjustments POST
      if (path === 'api/stock-adjustments' && req.method === 'POST') {
        const payload = await req.json();
        const { productId, type, qty, note } = payload;
        const products = await getSheetObjects('products', gtoken);
        const pidx = products.findIndex((p) => p.id === productId);
        if (pidx === -1) return jsonResponse({ message: 'Barang tidak ditemukan.' }, 400);
        const fixedQty = Number(qty||0);
        if (!fixedQty || !['IN','OUT'].includes(String(type).toUpperCase())) return jsonResponse({ message: 'Payload invalid' }, 400);
        const normalizedType = String(type).toUpperCase();
        const currentStock = Number(products[pidx].stock||0);
        const newStock = normalizedType === 'IN' ? currentStock + fixedQty : currentStock - fixedQty;
        if (newStock < 0) return jsonResponse({ message: 'Stok tidak mencukupi' }, 400);
        products[pidx].stock = String(newStock);
        products[pidx].updatedAt = new Date().toISOString();
        // write products and append movement row
        const headerP = SHEETS['products'];
        const rowsP = objectsToRows(headerP, products);
        await updateValues(SPREADSHEET_ID, `products!A1:${String.fromCharCode(64 + headerP.length)}${rowsP.length + 1}`, [headerP, ...rowsP], gtoken);
        const mv = { id: `MV-${Date.now()}`, createdAt: new Date().toISOString(), productId, productName: products[pidx].name, type: normalizedType, qty: String(fixedQty), balanceAfter: String(newStock), note: note||'Penyesuaian stok', actor: (user.username||'system'), refId: '-' };
        await appendValues(SPREADSHEET_ID, `movements!A1`, Object.values(mv).map((v)=>[v]), gtoken);
        return jsonResponse(mv);
      }

      // transactions GET
      if (path === 'api/transactions' && req.method === 'GET') {
        const txs = await getSheetObjects('transactions', gtoken);
        const items = await getSheetObjects('transaction_items', gtoken);
        const itemsByTx = items.reduce((acc, it)=>{ acc[it.transactionId] = acc[it.transactionId] || []; acc[it.transactionId].push({ productId: it.productId, productName: it.productName, qty: Number(it.qty||0), price: Number(it.price||0), subtotal: Number(it.subtotal||0) }); return acc; }, {});
        const mapped = txs.map((t)=>({ id:t.id, createdAt:t.createdAt, cashier:t.cashier, memberName:t.memberName, paymentMethod:t.paymentMethod, total: Number(t.total||0), items: itemsByTx[t.id]||[] }));
        return jsonResponse(mapped.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100));
      }

      // transactions POST (create)
      if (path === 'api/transactions' && req.method === 'POST') {
        const payload = await req.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) return jsonResponse({ message: 'Minimal 1 item transaksi' }, 400);
        const products = await getSheetObjects('products', gtoken);
        // validate & update stock
        let total = 0;
        const normalized = [];
        for (const it of items) {
          const prod = products.find((p)=>p.id===it.productId);
          if (!prod) return jsonResponse({ message: `Barang ${it.productId} tidak ditemukan` }, 400);
          const qty = Number(it.qty||0);
          if (qty<=0) return jsonResponse({ message: 'qty invalid' }, 400);
          if (Number(prod.stock||0) < qty) return jsonResponse({ message: `Stok tidak cukup untuk ${prod.name}` }, 400);
          const price = Number(prod.sellPrice||0); const subtotal = price*qty; total += subtotal;
          normalized.push({ prod, qty, price, subtotal });
        }
        const txId = `TRX-${Date.now()}`;
        const now = new Date().toISOString();
        // update stocks and movements
        for (const n of normalized) {
          const idx = products.findIndex((p)=>p.id===n.prod.id);
          const newStock = Number(products[idx].stock||0) - n.qty;
          products[idx].stock = String(newStock);
          products[idx].updatedAt = now;
          const mv = [ `MV-${Date.now()}-${Math.floor(Math.random()*1000)}`, now, n.prod.id, n.prod.name, 'OUT', String(n.qty), String(newStock), `Penjualan ${txId}`, (user.username||'system'), txId ];
          await appendValues(SPREADSHEET_ID, `movements!A1`, [mv], gtoken);
        }
        // write products back
        const headerP = SHEETS['products'];
        const rowsP = objectsToRows(headerP, products);
        await updateValues(SPREADSHEET_ID, `products!A1:${String.fromCharCode(64 + headerP.length)}${rowsP.length + 1}`, [headerP, ...rowsP], gtoken);
        // append transaction
        await appendValues(SPREADSHEET_ID, `transactions!A1`, [[txId, now, (user.username||'system'), payload.memberName||'-', payload.paymentMethod||'cash', String(total) ]], gtoken);
        // append transaction items
        for (const n of normalized) {
          await appendValues(SPREADSHEET_ID, `transaction_items!A1`, [[txId, n.prod.id, n.prod.name, String(n.qty), String(n.price), String(n.subtotal) ]], gtoken);
        }

        // Also add notification entries for any product that went below minStock
        const lowAfter = products.filter(p => Number(p.stock||0) <= Number(p.minStock||0));
        for (const p of lowAfter) {
          await appendValues(SPREADSHEET_ID, `notifications!A1`, [[new Date().toISOString(), p.id, p.name, p.stock]] , gtoken).catch(()=>{});
        }

        return jsonResponse({ id: txId, memberName: payload.memberName||'-', paymentMethod: payload.paymentMethod||'cash', total, items: normalized.map((x)=>({ productId: x.prod.id, productName: x.prod.name, qty: x.qty, price: x.price, subtotal: x.subtotal })) });
      }

      // NEW: notify-low-stock endpoint (creates notification rows) 
      if (path === 'api/notify-low-stock' && req.method === 'POST') {
        const products = await getSheetObjects('products', gtoken);
        const low = products.filter(p => Number(p.stock||0) <= Number(p.minStock||0));
        if (!low.length) return jsonResponse({ ok: true, message: 'No low stock' });
        for (const p of low) {
          await appendValues(SPREADSHEET_ID, `notifications!A1`, [[new Date().toISOString(), p.id, p.name, p.stock]] , gtoken).catch(()=>{});
        }
        return jsonResponse({ ok: true, count: low.length, items: low });
      }

      // NEW: list notifications
      if (path === 'api/notifications' && req.method === 'GET') {
        const nots = await getSheetObjects('notifications', gtoken).catch(()=>[]);
        return jsonResponse(nots.slice(0,200));
      }
    }

    // Fallback: serve static files from Workers not implemented — return 404
    return new Response('Not found', { status: 404 });
  } catch (err) {
    return jsonResponse({ message: err.message || String(err) }, 500);
  }
}

export default { fetch: handle };
