require('dotenv').config();

const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const corsHandler = require('./src/middleware/cors');
const {
  initSheets,
  authenticateAdmin,
  listProducts,
  upsertProduct,
  createStockAdjustment,
  listMovements,
  listTransactions,
  createTransaction,
} = require('./src/services/sheetsService');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

// Middleware
app.use(corsHandler);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa.' });
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await initSheets();
    res.json({ ok: true, message: 'Server dan koneksi spreadsheet siap.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi.' });
    }

    const admin = await authenticateAdmin(username, password);
    if (!admin) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    const token = jwt.sign(
      {
        username: admin.username,
        role: 'admin',
      },
      jwtSecret,
      { expiresIn: '8h' }
    );

    return res.json({ token, username: admin.username });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const products = await listProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const saved = await upsertProduct(payload, req.user.username);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/movements', requireAuth, async (req, res) => {
  try {
    const movements = await listMovements();
    res.json(movements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/stock-adjustments', requireAuth, async (req, res) => {
  try {
    const saved = await createStockAdjustment(req.body || {}, req.user.username);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const txs = await listTransactions();
    res.json(txs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const saved = await createTransaction(req.body || {}, req.user.username);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, async () => {
  try {
    await initSheets();
    console.log(`Koperasi web berjalan di http://localhost:${port}`);
  } catch (error) {
    console.error('Gagal inisialisasi spreadsheet:', error.message);
  }
});
