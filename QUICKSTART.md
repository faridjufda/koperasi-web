# Koperasi Web - Quick Start Guide

## 📦 Instalasi Lokal

```bash
# 1. Install dependencies
cd c:\project koperasi
npm install

# 2. Setup env file (copy template)
copy .env.example .env

# 3. Edit .env dengan Google Sheets credentials
# (Lihat SETUP_GOOGLE_SHEETS.md untuk cara mendapatkan credentials)

# 4. Run development server
npm run dev

# 5. Akses http://localhost:3000
```

---

## 👤 Buat Admin Account

```bash
npm run create-admin -- {username} {password}

# Contoh:
npm run create-admin -- kasir@koperasi koperasi2024
```

---

## 🚀 Deploy (2 Opsi)

### Opsi A: Cloudflare Pages + Railway
- **Frontend**: Cloudflare Pages (gratis, global CDN)
- **Backend**: Railway (gratis tier)
- **Setup time**: ~15 menit
- **[Lihat panduan lengkap →](./DEPLOY.md)**

### Opsi B: Localhost only (development)
```bash
npm run dev
# Akses: http://localhost:3000
```

---

## 📋 Project Structure

```
project koperasi/
├── public/                  # Frontend (HTML/CSS/JS)
│   ├── index.html          # Main page
│   ├── app.js              # React-like app logic
│   └── styles.css          # Modern styling
├── src/
│   └── services/
│       └── sheetsService.js # Google Sheets backend
├── server.js               # Express.js server
├── package.json            # Dependencies
├── SETUP_GOOGLE_SHEETS.md # Panduan setup sheets
└── DEPLOY.md              # Panduan deployment
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Fungsi |
|--------|----------|------|--------|
| POST | `/api/login` | ❌ | Login admin |
| GET | `/api/products` | ✅ | List barang |
| POST | `/api/products` | ✅ | Tambah/edit barang |
| GET | `/api/movements` | ✅ | Riwayat pergerakan stok |
| POST | `/api/stock-adjustments` | ✅ | Penyesuaian stok |
| GET | `/api/transactions` | ✅ | Riwayat transaksi |
| POST | `/api/transactions` | ✅ | Buat transaksi |
| GET | `/api/health` | ❌ | Check server status |

---

## 🐛 Troubleshooting

### Port 3000 sudah dipakai
```bash
# Cari proses yang pakai port 3000
netstat -ano | findstr :3000

# Kill process (ganti PID)
taskkill /PID {PID} /F
```

### Google Sheets tidak terhubung
-Cek `.env` file:
  - GOOGLE_SPREADSHEET_ID ada?
  - GOOGLE_SERVICE_ACCOUNT_EMAIL ada?
  - GOOGLE_PRIVATE_KEY format benar?
  - Spreadsheet sudah di-share ke service account email?

### Login gagal
```bash
# Reset admin account
npm run create-admin -- admin123 passwordbaru
```

### CSS tidak loading
- Hard refresh browser: `Ctrl+F5`
- Clear browser cache: DevTools → Application → Storage → Clear All
- Check Network tab di DevTools apakah `/styles.css` berhasil load

---

## 📚 Full Documentation

- **Setup Google Sheets:** [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md)
- **Deployment Guide:** [DEPLOY.md](./DEPLOY.md)
- **Original README:** [README.md](./README.md)

---

## 💡 Tips

- **Access Google Sheets:**
  - Spreadsheet otomatis ter-create sheets saat server start
  - Untuk melihat data secara real-time

- **Backup Data:**
  - Download Google Sheets sebagai CSV/Excel berkala

- **Custom Domain:**
  - Bisa pakai custom domain gratis di Cloudflare Pages
  - Tutorial: Domain registrar → Cloudflare nameservers

---

## 📞 Support

Jika ada error atau pertanyaan:
1. Cek file dokumentasi yang relevan
2. Cek console error (F12 → Console tab)
3. Cek Network tab untuk failed requests
4. Cek logs di terminal/server

---

**Version:** 1.0.0  
**Last Updated:** Feb 2026  
**Status:** Production Ready ✅
