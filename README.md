# Koperasi Web - Sistem Kasir & Pembukuan Barang

Aplikasi web untuk koperasi dengan fitur kasir, pembukuan barang, dan login admin berbasis **Google Spreadsheet** sebagai database.

## ✨ Fitur Utama

- 🔐 **Login Admin** - Autentikasi aman dengan JWT token
- 💳 **Kasir** - Transaksi penjualan real-time dengan riwayat
- 📊 **Pembukuan Barang** - Input/update barang, stok, harga
- 🔄 **Pergerakan Stok** - Tracking stok masuk/keluar dengan audit trail
- 📈 **Riwayat Transaksi** - Laporan lengkap dengan metode pembayaran
- ☁️ **Google Sheets Database** - Semua data tersimpan di spreadsheet
- 🎨 **Modern UI** - Design responsif, dark mode ready
- ⚡ **Production Ready** - Deploy ke Cloudflare + Railway (gratis)

---

## 🚀 Quick Start (3 Langkah)

### 1. Setup Lokal (5 menit)
```bash
cd c:\project koperasi
npm install
npm run dev
```
Akses: http://localhost:3000

### 2. Setup Google Sheets (15 menit)
Ikuti: [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md)
- Create Google Spreadsheet
- Setup Service Account
- Share ke aplikasi
- Update .env

### 3. Deploy to Production (30 menit) - Pilih Salah Satu ⭐

**❤️ OPSI A: Cloudflare Workers (RECOMMENDED)**
```
📖 Baca: CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md
✅ Gratis selamanya
✅ Serverless
✅ Global CDN
✅ Auto-scaling
💰 Cost: $0/month
```

**OPSI B: Railway + Cloudflare Pages**
```
📖 Baca: DEPLOY.md
⚠️ Railway berbayar $5/month
✅ Cloudflare Pages gratis
💰 Cost: $5/month
```

---

## 📚 Documentation

| File | Deskripsi | Link |
|------|-----------|------|
| **CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md** | ❤️ **Deploy 100% FREE dengan Cloudflare Workers** | [Open](./CLOUDFLARE_WORKERS_COMPLETE_GUIDE.md) |
| CLOUDFLARE_WORKERS_BACKEND_SETUP.md | Detail setup backend untuk Workers | [Open](./CLOUDFLARE_WORKERS_BACKEND_SETUP.md) |
| CLOUDFLARE_DEPLOYMENT_CHECKLIST.md | Checklist deployment dengan Spreadsheet ID Anda | [Open](./CLOUDFLARE_DEPLOYMENT_CHECKLIST.md) |
| SETUP_GOOGLE_SHEETS.md | Setup Google Sheets + Service Account (15 min) | [Open](./SETUP_GOOGLE_SHEETS.md) |
| DEPLOY.md | Deploy alternative: Railway + Cloudflare Pages | [Open](./DEPLOY.md) |
| QUICKSTART.md | Quick reference guide | [Open](./QUICKSTART.md) |
| PROJECT_STATUS.md | Detailed status & checklist | [Open](./PROJECT_STATUS.md) |

---

## 🏗️ Arsitektur (2 Pilihan Deployment)

### Opsi 1: Cloudflare Workers (RECOMMENDED ❤️)
```
┌──────────────────────┐
│  Cloudflare Pages    │  Frontend (HTML/CSS/JS)
│  koperasi.pages.dev  │  Global CDN, FREE
└───────────┬──────────┘
            │ API Calls
            ↓
┌──────────────────────┐
│ Cloudflare Workers   │  Backend (Node.js)
│ koperasi.workers.dev │  Serverless, FREE
└───────────┬──────────┘
            │
            ↓
┌──────────────────────┐
│  Google Sheets       │  Database
│  (6 auto sheets)     │  FREE, Auto-backup
└──────────────────────┘

Cost: $0/month 🎉
```

### Opsi 2: Railway + Cloudflare Pages (Alternative)
```
┌──────────────────────┐
│  Cloudflare Pages    │  Frontend
│  koperasi.pages.dev  │  FREE
└───────────┬──────────┘
            │ API Calls
            ↓
┌──────────────────────┐
│      Railway         │  Backend
│   railway.app        │  $5/month
└───────────┬──────────┘
            │
            ↓
┌──────────────────────┐
│  Google Sheets       │  Database
└──────────────────────┘

Cost: $5/month
```

---

## 📋 Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Modern styling)
- **Backend**: Node.js, Express.js
- **Database**: Google Sheets API
- **Authentication**: JWT (8 hours expiry)
- **Hosting Option 1**: Cloudflare Workers + Pages (**FREE** 🎉)
- **Hosting Option 2**: Railway + Cloudflare Pages ($5/month)
- **Cost**: **Starting from FREE** 🎉

---

## 🔌 API Reference

```javascript
// Authentication
POST /api/login              // { username, password }

// Products
GET  /api/products           // List all
POST /api/products           // Create/Update

// Transactions
GET  /api/transactions       // List all
POST /api/transactions       // Create new

// Stock Movement
GET  /api/movements          // List all movements
POST /api/stock-adjustments  // Record adjustment

// Health
GET  /api/health             // Server status
```

---

## 📁 Project Structure

```
project koperasi/
├── public/
│   ├── index.html           # Main page
│   ├── app.js               # Frontend logic
│   ├── styles.css           # Modern styling
│   └── favicon.ico
├── src/
│   ├── services/
│   │   └── sheetsService.js # Google Sheets integration
│   └── middleware/
│       └── cors.js          # CORS handler
├── scripts/
│   └── create-admin.js      # Admin creation script
├── server.js                # Express server
├── package.json             # Dependencies
├── railway.toml             # Railway config
├── wrangler.toml            # Cloudflare config
└── .env                     # Credentials (gitignored)
```

---

## 🔐 Security Features

- ✅ Password hashing (bcryptjs)
- ✅ JWT token-based auth
- ✅ Token expiry (8 hours)
- ✅ CORS protection
- ✅ Private key encryption (Google)
- ✅ No sensitive data in client

---

## 📊 Data Sheets Auto-created

Saat server start pertama kali, akan create:

| Sheet | Columns |
|-------|---------|
| `admins` | username, passwordHash, isActive |
| `products` | id, name, sellPrice, buyPrice, stock, minStock, updatedAt |
| `transactions` | id, createdAt, cashier, memberName, paymentMethod, total |
| `transaction_items` | transactionId, productId, productName, qty, price, subtotal |
| `movements` | id, createdAt, productId, productName, type, qty, balanceAfter, note, actor, refId |

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill the process
taskkill /PID {PID} /F
```

### Google Sheets not connecting
- Verify `.env` file has all required variables
- Check Service Account email is shared to spreadsheet
- Restart server after changing .env

### Login failing
```bash
# Reset admin password
npm run create-admin -- admin123 newpassword
```

---

## 🚀 Deployment Checklist

- [ ] Google Sheets setup complete
- [ ] .env file configured
- [ ] Local testing passed
- [ ] GitHub repo created
- [ ] Railway backend deployed
- [ ] Cloudflare frontend deployed
- [ ] Production testing done
- [ ] Custom domain setup (optional)

---

## 📞 Support & Contributing

Untuk issues atau features:
1. Check documentation files
2. Test di development environment
3. Check browser console (F12) untuk errors
4. Review API health: `GET /api/health`

---

## 📄 License

Free to use for personal & commercial koperasi use.

---

## 🎯 Roadmap

Future enhancements:
- [ ] Barcode/QR scanning untuk kasir
- [ ] Export ke PDF/Excel reports
- [ ] Dashboard analytics & charts
- [ ] Multi-user dengan role-based access
- [ ] Mobile app (React Native)
- [ ] WhatsApp notification integration
- [ ] Inventory prediction (ML)

---

**Version**: 1.0.0  
**Status**: Production Ready ✅  
**Last Updated**: February 2026

---

💡 **Pro Tips:**
- Backup Google Sheets regularly (download as CSV)
- Monitor Railway dashboard for deployment status
- Use custom domain di Cloudflare untuk profesional look
- Setup Google Sheets notifications untuk stock alerts

