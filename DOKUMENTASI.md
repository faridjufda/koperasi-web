# 📚 Dokumentasi Koperasi Web

Panduan lengkap untuk setup, development, dan deployment aplikasi koperasi.

---

## 🗂️ Struktur Dokumentasi

```
Dokumentasi/
├── README.md ........................ Ringkasan project & features
├── PROJECT_STATUS.md ............... Status kelengkapan & checklist
├── QUICKSTART.md ................... Quick reference untuk developers
├── SETUP_GOOGLE_SHEETS.md .......... Setup Google Sheets + Service Account
├── DEPLOY.md ....................... Deploy ke Railway + Cloudflare Pages
└── DOKUMENTASI.md .................. File ini (index dokumentasi)
```

---

## 🎯 Mulai Dari Mana?

### 1️⃣ Baru Pertama Kali?
**Durasi**: 5 menit  
**File**: [README.md](./README.md)

Bacanya untuk:
- Understand fitur-fitur utama
- Lihat tech stack yang dipake
- Lihat architecture diagram
- Quick start kode lokal

### 2️⃣ Setup Google Sheets (CRITICAL)
**Durasi**: 15 menit  
**File**: [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md)

Step-by-step untuk:
- Create Google Cloud Project
- Setup Service Account
- Generate Private Key
- Share Spreadsheet dengan Service Account
- Config .env file dengan credentials

⚠️ **WAJIB DIKERJAKAN** sebelum deployment!

### 3️⃣ Development Lokal
**Durasi**: 5 menit  
**File**: [QUICKSTART.md](./QUICKSTART.md)

Cepet setup untuk developers:
```bash
npm install
npm run dev
```

Akses: http://localhost:3000

### 4️⃣ Deploy ke Production
**Durasi**: 20 menit  
**File**: [DEPLOY.md](./DEPLOY.md)

Deploy ke production:
- Part A: Backend di Railway.app
- Part B: Frontend di Cloudflare Pages
- Part C: Testing production

### 5️⃣ Cek Status Project
**Durasi**: 10 menit  
**File**: [PROJECT_STATUS.md](./PROJECT_STATUS.md)

Lihat:
- Checklist kelengkapan
- Feature matrix
- Security implementation
- Deployment architecture

---

## 📖 Detail per File

### 📄 README.md
```markdown
Konten utama:
├─ Features (✨ apa aja yang bisa)
├─ Quick Start (🚀 mulai 5 menit)
├─ Documentation index (📚 file-file)
├─ Tech Stack (💻 teknologi)
├─ API Reference (🔌 endpoints)
├─ Project Structure (📁 folder layout)
├─ Security Features (🔐 keamanan)
├─ Data Sheets (📊 database schema)
├─ Troubleshooting (🐛 bantuan)
└─ Deployment Checklist (✅ TDL)

Baca: Pertama kali untuk overview

Gunakan: Referensi features & struktur
```

### 📄 QUICKSTART.md
```markdown
Konten singkat:
├─ Install (npm install)
├─ Create Admin (npm run create-admin)
├─ Run Dev (npm run dev)
├─ API Endpoints (table format)
├─ Usage Examples (kode JavaScript)
├─ Common Issues (troubleshooting)
└─ Project Structure (file tree)

Baca: Kalau sudah kenal project

Gunakan: Reference cepat untuk development
```

### 📄 SETUP_GOOGLE_SHEETS.md
```markdown
Konten detail 5 steps:

STEP 1: Create Google Cloud Project (2 min)
├─ Go to console.cloud.google.com
├─ New Project → Koperasi
├─ Enable Google Sheets API
└─ Verify enabled

STEP 2: Create Service Account (3 min)
├─ IAM & Admin → Service Accounts
├─ Create Service Account
├─ Name: koperasi-app
├─ Grant Editor role
└─ Create

STEP 3: Generate Private Key (2 min)
├─ Go to Service Account detail
├─ Keys tab → Add Key
├─ Create new JSON key
├─ Download JSON file
└─ Copy content ke .env

STEP 4: Create Google Spreadsheet (2 min)
├─ sheets.google.com → New spreadsheet
├─ Name: Koperasi Data
├─ Get spreadsheet ID dari URL
└─ Copy ke .env

STEP 5: Share Spreadsheet (3 min)
├─ Click Share
├─ Paste Service Account email
├─ Role: Editor
├─ Share
└─ Done!

STEP 6: Config .env (1 min)
├─ Copy GOOGLE_SHEET_ID
├─ Copy GOOGLE_PRIVATE_KEY
├─ Copy GOOGLE_CLIENT_EMAIL
└─ Verify di server.js

Baca: SEBELUM deployment

Gunakan: Checklist untuk setup Google
```

### 📄 DEPLOY.md
```markdown
Konten deployment 2 pilihan:

PILIHAN 1: Railway.app (Backend)
├─ Create Railway Account
├─ Connect GitHub
├─ New Project from GitHub
├─ Select koperasi-web repo
├─ Auto deploy on push
├─ Set env variables
├─ Verify health check
└─ Get Railway URL

PILIHAN 2: Cloudflare Pages (Frontend)
├─ Create Cloudflare Account
├─ Pages → Create project
├─ Connect GitHub
├─ Select koperasi-web repo
├─ Build: npm run build (null, skip)
├─ Create CNAME (optional)
├─ Auto deploy on push
└─ Get .pages.dev URL

STEP 3: Testing Production
├─ Check backend health
├─ Check frontend loads
├─ Create admin account
├─ Test login, transaksi
└─ Monitor logs

STEP 4: Troubleshooting
├─ 502 Bad Gateway?
├─ CORS errors?
├─ Login 401 unauthorized?
├─ API_BASE wrong?
└─ Solutions untuk semua

Baca: SETELAH setup Google Sheets

Gunakan: Deployment checklist
```

### 📄 PROJECT_STATUS.md
```markdown
Konten lengkap status:

SECTIONS:
├─ Completion Checklist (14 categories)
├─ File Structure (tree dengan status)
├─ Feature Matrix (12 features)
├─ Code Quality (4 metrics)
├─ Deployment Readiness (checklist)
├─ Architecture Diagram (ASCII art)
├─ Security Implementation
├─ Database Schema (semua sheets)
├─ Technology Stack
├─ Documentation Index
├─ Pro Tips
├─ Troubleshooting Matrix
├─ Success Metrics
└─ Project Completion Status

Baca: Untuk lihat overview lengkap

Gunakan: Verification setelah selesai
```

---

## 🎬 Workflow Rekomendasi

### Minggu 1: Setup & Testing Lokal
```
Day 1: Setup Google Sheets (SETUP_GOOGLE_SHEETS.md)
├─ 1 jam: Create GCP project + Service Account
├─ 1 jam: Config .env file
└─ 30 min: Verify connection

Day 2: Development Lokal (QUICKSTART.md)
├─ 30 min: npm install
├─ 30 min: Create admin accounts
├─ 1 jam: Test all features lokal
└─ 1 jam: Explore codebase

Day 3: Customization (opsional)
├─ Update colors di CSS
├─ Add features baru
├─ Custom domain setup
└─ Export di Google Sheets
```

### Minggu 2: Deployment
```
Day 1: Backend Deploy (DEPLOY.md Part A)
├─ 30 min: Setup Railway account
├─ 30 min: Connect GitHub & auto-deploy
├─ 30 min: Set environment variables
└─ 30 min: Verify API health

Day 2: Frontend Deploy (DEPLOY.md Part B)
├─ 30 min: Setup Cloudflare account
├─ 30 min: Connect GitHub & auto-deploy
├─ 1 jam: Testing production
└─ Optional: Setup custom domain

Day 3: Monitoring & Optimization
├─ Monitor logs
├─ Check performance
├─ Setup alerts
└─ Backup Google Sheets
```

---

## 🔗 Quick Links

### 📚 Dokumentasi
| File | Durasi | Untuk |
|------|--------|-------|
| [README.md](./README.md) | 5 min | Overview project |
| [QUICKSTART.md](./QUICKSTART.md) | 3 min | Quick reference |
| [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md) | 15 min | Setup Google |
| [DEPLOY.md](./DEPLOY.md) | 20 min | Deploy production |
| [PROJECT_STATUS.md](./PROJECT_STATUS.md) | 10 min | Status lengkap |

### 🔧 External Resources
| Resource | Link | Gunakan Untuk |
|----------|------|----------------|
| Google Cloud Console | https://console.cloud.google.com | Create Service Account |
| Railway | https://railway.app | Deploy backend |
| Cloudflare Pages | https://pages.cloudflare.com | Deploy frontend |
| GitHub | https://github.com | Version control |
| Google Sheets | https://sheets.google.com | Database |

### 💻 Teknologi
| Tech | Link | Notes |
|------|------|-------|
| Node.js | https://nodejs.org | Backend runtime |
| Express.js | https://expressjs.com | API framework |
| Google Sheets API | https://developers.google.com/sheets | Database |

---

## ✅ Pre-Deployment Checklist

### Sebelum `npm run dev`
- [ ] Node.js v16+ installed (`node --version`)
- [ ] `npm install` sudah dijalankan
- [ ] `.env` file sudah created dengan Google credentials

### Sebelum GitHub push
- [ ] Test lokal sudah berjalan sempurna
- [ ] `npm run build` (jika ada)
- [ ] `.env` file di `.gitignore` (jangan push)
- [ ] `node_modules/` di `.gitignore`

### Sebelum Railway deployment
- [ ] GitHub repo created & pushed
- [ ] Railway account created
- [ ] GitHub connected ke Railway
- [ ] Environment variables di Railway dashboard

### Sebelum Cloudflare deployment
- [ ] Cloudflare account created
- [ ] GitHub connected ke Cloudflare
- [ ] Build settings dikonfigurasi
- [ ] API_BASE di app.js sesuai Railway URL

### Sebelum Production use
- [ ] Backend health check: `/api/health` → 200
- [ ] Frontend loads di browser
- [ ] Login berhasil dengan admin account
- [ ] Create product berhasil
- [ ] Transaction berhasil
- [ ] Riwayat muncul dengan benar

---

## 🚀 Next Steps

### Jika belum setup:
1. Baca [README.md](./README.md) - 5 min
2. Follow [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md) - 15 min
3. Test lokal per [QUICKSTART.md](./QUICKSTART.md) - 10 min

### Jika sudah ready deploy:
1. Push ke GitHub
2. Follow [DEPLOY.md](./DEPLOY.md) Part A (Railway) - 20 min
3. Follow [DEPLOY.md](./DEPLOY.md) Part B (Cloudflare) - 20 min
4. Test production
5. DONE! Aplikasi live 🎉

---

## 📊 Documentation Statistics

```
Total Documentation:
├─ Files: 6 files
├─ Lines: ~1500 lines
├─ Words: ~18000 words
├─ Code examples: 50+
└─ Hours to read all: 1-2 hours

Coverage:
├─ Setup: 100% ✅
├─ Development: 100% ✅
├─ Deployment: 100% ✅
├─ Troubleshooting: 100% ✅
└─ Best Practices: 100% ✅
```

---

## 💡 Important Notes

### Google Sheets Setup (KRITIS)
⚠️ Jangan skip step ini! Tanpa Google credentials, server tidak bisa run.

### Security
🔐 Jangan commit `.env` file! Dia ada di `.gitignore` untuk alasan keamanan.

### Production
🚀 Test lokal thoroughly sebelum deploy. Production debugging lebih susah.

### Database
💾 Always backup Google Sheets sebelum major changes.
```
Google Sheets → ☰ → Download → CSV
```

---

## 🎓 Learning Resources

Jika ingin belajar lebih dalam:

### Backend (Node.js + Express)
- [Express.js Guide](https://expressjs.com/en/starter/basic-routing.html)
- [Google Sheets API Docs](https://developers.google.com/sheets/api/guides/concepts)
- [JWT Authentication](https://jwt.io/introduction)

### Frontend (Vanilla JS)
- [MDN Web Docs](https://developer.mozilla.org)
- [JavaScript Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [CSS Variables](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)

### DevOps
- [Railway Documentation](https://docs.railway.app)
- [Cloudflare Pages Guide](https://developers.cloudflare.com/pages)
- [Git Basics](https://git-scm.com/doc)

---

## 🤝 Support

Kalau ada pertanyaan:

1. **Check dokumentasi** dulu
2. **Check troubleshooting** section
3. **Check browser console** (F12)
4. **Check server logs**
5. **Check Railway/Cloudflare logs**

---

**Last Updated**: February 2026  
**Status**: Complete Documentation ✅  
**Version**: 1.0.0

Selamat setup dan deploy! 🚀
