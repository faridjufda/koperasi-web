# 🚀 Deploy Koperasi Web ke Cloudflare Workers (100% FREE)

**Status**: Production-Ready  
**Cost**: Completely FREE ✅  
**Deployment Time**: 30 minutes  
**Hosting**: Cloudflare Workers (serverless)

---

## 📋 Overview

Cloudflare Workers adalah **serverless platform 100% gratis** milik Cloudflare. Anda bisa deploy:
- ✅ Backend (Node.js) → Cloudflare Workers
- ✅ Frontend (HTML/CSS/JS) → Cloudflare Pages
- ✅ Database → Google Sheets (FREE)

**Total Cost: $0/month selamanya!** 🎉

---

## 🎯 Architecture

```
Users (Browser)
    ↓ HTTPS
┌───────────────────────────────────┐
│  Cloudflare Pages (Frontend)      │  HTML, CSS, JS
│  koperasi.pages.dev               │  Global CDN
└──────────────────┬────────────────┘
                   │ API Calls
                   ↓
┌───────────────────────────────────┐
│  Cloudflare Workers (Backend)     │  Node.js API
│  koperasi.workers.dev             │  Serverless
└──────────────────┬────────────────┘
                   │ Spreadsheet API
                   ↓
┌───────────────────────────────────┐
│  Google Sheets                    │  Database
│  (Auto-created 5 sheets)          │  FREE
└───────────────────────────────────┘
```

---

## ✅ Prerequisites

### 1. Install Tools
```bash
# NodeJS v18+ dan npm sudah harus terinstall
node --version
npm --version

# Install Wrangler (Cloudflare CLI)
npm install -g wrangler

# Verify installation
wrangler --version
```

### 2. Accounts Needed
- ✅ Cloudflare Account (FREE) - https://dash.cloudflare.com
- ✅ GitHub Account - https://github.com
- ✅ Google Cloud Project (dari SETUP_GOOGLE_SHEETS.md)

### 3. Info Required
- Spreadsheet ID: `11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA`
- Google Private Key: (dari .env)
- Google Client Email: (dari .env)

---

## 🔧 STEP 1: Refactor Backend untuk Cloudflare Workers

### 1.1 Update server.js untuk Wrangler

Saya akan buat versi Cloudflare Workers dari server.js Anda:

```bash
# Backup original
copy server.js server.js.bak

# Create new workers entry point
npm install wrangler
```

Mari proses JSON dari .env Anda terlebih dahulu untuk setup credentials.

---

## 📝 STEP 2: Setup Cloudflare Project

### 2.1 Create Wrangler Project
```bash
# Login ke Cloudflare
wrangler login

# Verify login successful
wrangler whoami
```

Ini akan buka browser untuk login. Setelah login, Anda akan dapat API token.

### 2.2 Create GitHub Repository
```bash
# Initialize git
cd c:\project koperasi
git init
git add .
git commit -m "Initial commit - Koperasi Web"

# Create repo on GitHub.com
# Then link:
git remote add origin https://github.com/YOUR_USERNAME/koperasi-web.git
git branch -M main
git push -u origin main
```

---

## 🚀 STEP 3: Deploy Backend ke Cloudflare Workers

### 3.1 Configure wrangler.toml

File sudah ada, kita tinggal update dengan Google credentials:

```toml
[env.production]
vars = { GOOGLE_SHEET_ID = "11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA" }

[env.production.vars]
GOOGLE_SHEET_ID = "11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA"
```

### 3.2 Set Secrets (Sensitive Data)
```bash
# Set private key (dari .env)
wrangler secret put GOOGLE_PRIVATE_KEY --env production

# Set client email (dari .env)
wrangler secret put GOOGLE_CLIENT_EMAIL --env production

# Set JWT secret
wrangler secret put JWT_SECRET --env production

# Verify
wrangler secret list --env production
```

### 3.3 Deploy to Cloudflare Workers
```bash
# Test locally first
wrangler dev

# Access: http://localhost:8787

# Deploy to production
wrangler deploy --env production
```

**Result**: Backend live di `https://koperasi-YOUR_ACCOUNT.workers.dev`

---

## 🎨 STEP 4: Deploy Frontend ke Cloudflare Pages

### 4.1 Connect GitHub ke Cloudflare Pages

1. Go to: https://dash.cloudflare.com
2. Click: **Pages** di sidebar kiri
3. Click: **Create a project**
4. Select: **Connect to Git**
5. Authorize GitHub
6. Select: `koperasi-web` repository
7. Click: **Begin setup**

### 4.2 Build Settings

Dalam setup wizard:
- **Framework preset**: None (karena vanilla JS)
- **Build command**: (leave empty)
- **Build output directory**: `public`

### 4.3 Environment Variables

Di **Settings → Environment variables**:

Tambahkan satu variable:
```
REACT_APP_API_URL = https://koperasi-YOUR_ACCOUNT.workers.dev/api
```

(Ganti `YOUR_ACCOUNT` dengan account name Cloudflare Anda)

### 4.4 Update App Config

Update `public/app.js`:

Cari baris:
```javascript
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api';
  }
  return 'https://koperasi-web.railway.app/api';  // ← GANTI INI
})();
```

Ganti dengan:
```javascript
const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api';
  }
  return 'https://koperasi-YOUR_ACCOUNT.workers.dev/api';  // ← GANTI
})();
```

### 4.5 Deploy Pages

```bash
# Push ke GitHub
git add public/app.js
git commit -m "Update API_BASE for Cloudflare Workers"
git push origin main
```

Cloudflare Pages akan **auto-deploy** dari GitHub. Tunggu ~2-3 menit.

**Result**: Frontend live di `https://koperasi.pages.dev` atau custom domain

---

## 📊 STEP 5: Configure Production Environment

### 5.1 Create .env.production

```bash
# Backend (.env in project root)
NODE_ENV=production
PORT=8787

GOOGLE_SHEET_ID=11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA

# These go to Cloudflare Secrets (via wrangler secret put)
# GOOGLE_PRIVATE_KEY=...
# GOOGLE_CLIENT_EMAIL=...
# JWT_SECRET=...
```

### 5.2 Verify Secrets Set Correctly

```bash
# List all secrets
wrangler secret list --env production

# Should show:
# ┌──────────────────────┐
# │ name                 │
# ├──────────────────────┤
# │ GOOGLE_PRIVATE_KEY   │
# │ GOOGLE_CLIENT_EMAIL  │
# │ JWT_SECRET           │
# └──────────────────────┘
```

---

## 🧪 STEP 6: Testing Production

### 6.1 Test Backend API

```bash
# Health check
curl https://koperasi-YOUR_ACCOUNT.workers.dev/api/health

# Should return: { "ok": true, "message": "Server is running" }
```

### 6.2 Test Frontend

```bash
# Open in browser
https://koperasi.pages.dev

# Or use curl
curl https://koperasi.pages.dev

# Should return HTML with "Koperasi Web"
```

### 6.3 Test Login

1. Go to: `https://koperasi.pages.dev`
2. Create admin: 
```bash
npm run create-admin -- admin123 koperasi2024
```
3. Login: admin123 / koperasi2024
4. Should see dashboard

### 6.4 Test Full Workflow

1. **Login**: Use admin credentials
2. **Create Product**: 
   - Name: Beras
   - Sell Price: 15000
   - Buy Price: 10000
   - Stock: 50
3. **Create Transaction**:
   - Select Beras
   - Qty: 1
   - Should calculate total: 15000
4. **Check Google Sheets**: 
   - Data should appear in sheets

---

## 🔐 Security Checklist

- ✅ All secrets in Cloudflare (never in code)
- ✅ .env in .gitignore (never commit)
- ✅ HTTPS enforced
- ✅ CORS configured
- ✅ JWT tokens with expiry
- ✅ Password hashing enabled

---

## 📱 Custom Domain (Optional)

### Add Custom Domain to Pages

1. Go: Cloudflare Dashboard → Pages → koperasi
2. Click: **Custom domains**
3. Add your domain (e.g., koperasi.com)
4. Follow DNS setup instructions

### Add Custom Domain to Workers

1. Go: Cloudflare Dashboard → Workers → Routes
2. Create route: `api.yourdomain.com/*`
3. Point to: Your Cloudflare Workers service

---

## 🐛 Troubleshooting

### "wrangler not found"
```bash
npm install -g wrangler
wrangler --version
```

### "Secret not set"
```bash
# Re-check secrets
wrangler secret list --env production

# Re-add if missing
wrangler secret put GOOGLE_PRIVATE_KEY --env production
```

### "API_BASE error"
- Verify app.js has correct Workers URL
- Check .env in Cloudflare is set
- Test health endpoint: `/api/health`

### "Login fails"
- Check JWT_SECRET is set in Cloudflare
- Check Google credentials are valid
- Check .env values in wrangler.toml

### "Google Sheets connection fails"
- Verify GOOGLE_SHEET_ID in wrangler.toml
- Verify Service Account email is shared to spreadsheet
- Try locally first: `npm run dev`

---

## 📊 Monitoring

### Check Logs
```bash
# Real-time logs
wrangler tail --env production

# View on dashboard
# https://dash.cloudflare.com → Workers → Logs
```

### Monitor Performance
```bash
# Pages analytics
# https://dash.cloudflare.com → Pages → Analytics

# Workers analytics
# https://dash.cloudflare.com → Workers → Metrics
```

---

## 🎯 What's the Cost?

```
Cloudflare Workers:  FREE (100,000 requests/day included)
Cloudflare Pages:    FREE (unlimited bandwidth)
Google Sheets:       FREE (15GB limit, but usually enough)

Total Cost: $0/month 🎉

If you exceed 100k requests/day (unlikely for small koperasi):
- $0.50 per million requests
- Still incredibly cheap!
```

---

## ✅ Deployment Checklist

- [ ] Wrangler installed globally
- [ ] Cloudflare account created & logged in
- [ ] GitHub repository created
- [ ] Code pushed to GitHub
- [ ] Cloudflare Secrets set (3 secrets)
- [ ] wrangler.toml configured with GOOGLE_SHEET_ID
- [ ] Backend deployed to Workers
- [ ] Frontend deployed to Pages
- [ ] API_BASE updated in app.js
- [ ] Custom domain added (optional)
- [ ] All tests passed

---

## 🚀 Next Steps

1. **Now**: Read SETUP_GOOGLE_SHEETS.md to get credentials
2. **Then**: Follow steps above to deploy
3. **Finally**: Monitor in Cloudflare Dashboard

---

## 📞 Support

**Issue**: Check logs with `wrangler tail`
**Question**: Read Cloudflare docs: https://developers.cloudflare.com/workers
**Emergency**: Rollback by deploying previous version: `wrangler rollback`

---

**Status**: Ready to Deploy ✅  
**Time**: ~30 minutes  
**Cost**: FREE 🎉
