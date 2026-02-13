# Deploy ke Cloudflare + Railway - Panduan Lengkap

## 🏗️ Arsitektur Deployment

```
Internet
   ↓
Cloudflare Pages (Frontend - HTML/CSS/JS)
   ↓ fetch API
Railway (Backend - Node.js + Database)
   ↓
Google Sheets
```

Ini adalah setup **production-ready** terbaik untuk aplikasi ini.

---

## 📋 Opsi Deployment Untuk Cloudflare

### Opsi 1: Cloudflare Pages (Frontend) + Railway (Backend) ⭐ **RECOMMENDED**
- Frontend: Static files di Cloudflare Pages (gratis)
- Backend: Node.js di Railway (free tier cukup untuk MVP)
- Database: Google Sheets (gratis)
- **Keuntungan:** Mudah, cepat, scalable, error handling jelas
- **Waktu setup:** ~15 menit

### Opsi 2: Cloudflare Workers (Full Stack)
- Semua di Cloudflare Workers (serverless)
- **Keuntungan:** Unified platform
- **Kekurangan:** Perlu refactor kode, kompleks
- **Waktu setup:** ~1 jam

### Opsi 3: Cloudflare Pages (Full Stack dengan SSR)
- Pages dengan Node.js adapter
- **Keuntungan:** Vite/React bisa
- **Kekurangan:** Perlu refactor ke framework, tidak cocok untuk app ini
- **Waktu setup:** ~2 jam + refactor

---

## 🚀 SETUP OPSI 1: Cloudflare Pages + Railway (RECOMMENDED)

### BAGIAN 1: Deploy Backend ke Railway

#### 1.1 Buat Akun Railway
1. Buka https://railway.app
2. Klik **"Sign Up"** → **"Github"** (paling mudah)
3. Authorize akses GitHub
4. Selesai (Railway account created)

#### 1.2 Prepare Code untuk Railway
1. Terminal, pastikan di folder project:
```bash
cd c:\project koperasi
```

2. Buat file `railway.toml` untuk konfigurasi:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckInterval = 10
```

3. Update `package.json` start script (verifikasi sudah ada):
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "create-admin": "node scripts/create-admin.js"
}
```

#### 1.3 Push ke GitHub
```bash
# Inisialisasi git
git init
git add .
git commit -m "Initial commit - Koperasi Web"

# Buat repository di GitHub (kosong)
# Kemudian:
git remote add origin https://github.com/YOUR_USERNAME/koperasi-web.git
git branch -M main
git push -u origin main
```

#### 1.4 Deploy di Railway
1. Buka https://railway.app/new
2. Pilih **"GitHub Repo"**
3. Authorize & pilih repository `koperasi-web`
4. Railway otomatis detect Node.js + deploy
5. Tunggu ~3-5 menit (build & deploy)
6. Klik deployment selesai → copy URL domain
   - Contoh: `https://koperasi-web.railway.app`

#### 1.5 Set Environment Variables di Railway
1. Di Railway dashboard → project **koperasi-web**
2. Tab **"Variables"**
3. Add variables (dari `.env`):
```
PORT: 3000
JWT_SECRET: koperasi-secret-key-2024-xyz
GOOGLE_SPREADSHEET_ID: 1a2b3c4d5e6f...
GOOGLE_SERVICE_ACCOUNT_EMAIL: koperasi-app@project-xyz.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY: -----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
```

4. Jika perubahan, klik **Redeploy**

#### 1.6 Test Backend
```bash
curl https://koperasi-web.railway.app/api/health
```

Response:
```json
{"ok":true,"message":"Server dan koneksi spreadsheet siap."}
```

---

### BAGIAN 2: Deploy Frontend ke Cloudflare Pages

#### 2.1 Buat Folder `dist/` untuk Production Build
1. Folder `public/` sudah ada dengan semua static files
2. Kita copy-rename menjadi `dist/` untuk Cloudflare Pages standar

#### 2.2 Create Build Configuration
File: `c:\project koperasi\.env.production` (buat baru)
```
VITE_API_URL=https://koperasi-web.railway.app
```

#### 2.3 Update `app.js` untuk Prod API
Di file `c:\project koperasi\public\app.js`, update fetch calls:

Ganti:
```javascript
const API_BASE = process.env.VITE_API_URL || '/api';
```

Pada awal file (setelah state definition), tambahkan:
```javascript
// Production API URL
const API_BASE = typeof window !== 'undefined' 
  ? (window.location.hostname === 'localhost' ? '/api' : 'https://koperasi-web.railway.app/api')
  : '/api';
```

Lalu ganti semua `apiFetch('/api/...` menjadi `apiFetch(API_BASE + '/...`

#### 2.4 Prepare File untuk Cloudflare
```bash
# Copy public/ menjadi dist/
Copy-Item -Path ".\public\*" -Destination ".\dist\" -Recurse
```

#### 2.5 Create `wrangler.toml` (Cloudflare Config)
File: `c:\project koperasi\wrangler.toml`
```toml
name = "koperasi-web-frontend"
type = "javascript"
account_id = ""
workers_dev = true
route = ""
zone_id = ""

[env.production]
name = "koperasi-web"
routes = [
  { pattern = "koperasi.pages.dev/*", zone_name = "pages.dev" }
]

[build]
command = "echo 'no build needed, static files only'"
cwd = "./dist"
watch_paths = []
```

#### 2.6 Push ke GitHub (update repo)
```bash
git add .
git commit -m "Add deployment config for Cloudflare Pages"
git push
```

#### 2.7 Deploy ke Cloudflare Pages
1. Buka https://dash.cloudflare.com
2. Login / Sign Up (atau gunakan GitHub)
3. Pilih account → **Workers & Pages** → **Pages**
4. Klik **"Connect to Git"**
5. Authorize GitHub → pilih repository `koperasi-web`
6. Configure build:
   - **Framework**: None (atau jika ada, pilih "None")
   - **Build command**: `echo 'static files only'` (atau kosongkan)
   - **Build output directory**: `dist`
   - **Root directory**: `/`
7. Klik **Save and Deploy**
8. Tunggu ~2 menit
9. Copy domain: `koperasi-web.pages.dev` (atau custom domain jika ada)

#### 2.8 Add Custom Domain (Optional)
Jika punya custom domain (mis: `koperasi.com`):
1. Cloudflare dashboard → Custom Domain
2. Arahkan nameserver domain ke Cloudflare
3. Setup di Cloudflare Pages → Custom Domain
4. Selesai dalam ~24 jam

---

## 🧪 TESTING DEPLOYMENT

### Test Backend (Railway)
```bash
# Test health check
curl https://koperasi-web.railway.app/api/health

# Test login (dummy)
curl -X POST https://koperasi-web.railway.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin123","password":"passwordkuat"}'
```

### Test Frontend + Backend Integration
1. Buka https://koperasi-web.pages.dev
2. Seharusnya loading (loading state akan terlihat karena fetch ke backend)
3. Jika error, check **Browser Console (F12)** → Network tab
   - Apakah request ke Railway berhasil?
   - CORS error? (Rails akan handle ini)

### Troubleshooting Deployment

**Error: CORS blocking requests**
- Solusi: Tambahkan di `server.js` header CORS:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
```

**Error: Railway build fails**
- Solusi: Check build logs di Railway → Deployments → klik failed build
- Biasanya: missing env variable, atau ada error syntax

**Error: Cloudflare Pages not updating**
- Solusi: 
  - Hard refresh (Ctrl+F5)
  - Clear Cloudflare cache di dashboard
  - Check deployment status di Pages → Deployments

---

## 📊 Production Checklist

Sebelum "go live" dengan users:

- [ ] Backend Railway running & health check OK
- [ ] Frontend Cloudflare Pages deployed & loading
- [ ] Login test berhasil dengan admin account
- [ ] Create product berhasil & data tersimpan ke Google Sheets
- [ ] Transaksi berhasil & riwayat tercatat
- [ ] Mobile responsive tested
- [ ] Error handling tested
- [ ] Performance check (browser DevTools Lighthouse)

---

## 🎯 Summary Deployment

| Component | Platform | Cost | Status |
|-----------|----------|------|--------|
| Frontend | Cloudflare Pages | Free | ✅ |
| Backend | Railway | Free tier (unlimited) | ✅ |
| Database | Google Sheets | Free | ✅ |
| **Total** | | **Free** | ✅ |

**Domain:**
- Frontend: `https://koperasi-web.pages.dev` (atau custom domain)
- Backend: `https://koperasi-web.railway.app`

---

## 🚀 Next Steps

1. Setup Google Sheets (SETUP_GOOGLE_SHEETS.md)
2. Test lokal (npm run dev)
3. Push ke GitHub
4. Deploy ke Railway (backend)
5. Deploy ke Cloudflare Pages (frontend)
6. Test production
7. Share link ke users!

Semuanya GRATIS dan production-ready! 🎉
