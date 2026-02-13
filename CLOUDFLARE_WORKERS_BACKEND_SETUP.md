# Cloudflare Workers Backend - Setup Guide

Untuk menjalankan Express app di Cloudflare Workers, ada 2 pilihan:

---

## 🎯 PILIHAN 1: Express.js dengan Node.js Compatibility (Mudah ✅)

**Keuntungan:**
- Tidak perlu refactor kode
- Express sudah berjalan langsung
- Hanya butuh update `wrangler.toml`

**Cara Setup:**

### 1. Update wrangler.toml

Tambahkan di bagian atas file:

```toml
name = "koperasi"
main = "server.js"
compatibility_date = "2024-02-13"
compatibility_flags = ["nodejs_compat"]
node_compat = true

[env.production]
vars = { GOOGLE_SHEET_ID = "11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA" }
```

### 2. Update server.js - Ganti PORT

Cari bagian di server.js:

```javascript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Ganti dengan:

```javascript
const PORT = process.env.PORT || 8787;

// Untuk Cloudflare Workers
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept();
}

export default app;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 3. Deploy

```bash
# Test locally
wrangler dev

# Deploy
wrangler deploy --env production
```

**Result**: Backend live di `https://koperasi-YOUR_ACCOUNT.workers.dev`

---

## 🎯 PILIHAN 2: Native Fetch API (Optimal untuk Cloudflare)

**Keuntungan:**
- Lebih ringan & cepat
- Native Cloudflare optimization
- Tidak ada overhead Express

**Kekurangan:**
- Perlu refactor kode sedikit
- Lebih rumit

**Saya rekomendasikan PILIHAN 1** karena lebih mudah! ✅

---

## 🔧 Update wrangler.toml Lengkap

```toml
# Konfigurasi umum
name = "koperasi-backend"
main = "server.js"
compatibility_date = "2024-02-13"
compatibility_flags = ["nodejs_compat"]
node_compat = true

# Variables untuk production
[env.production]
vars = {
  GOOGLE_SHEET_ID = "11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA",
  NODE_ENV = "production",
  JWT_SECRET_PLACEHOLDER = "placeholder"  # Actual secret will be set via wrangler secret
}

# Build configuration
[build]
command = "npm install"
cwd = "."
main = "server.js"

# Routes untuk Cloudflare
routes = [
  { pattern = "api.koperasi.com/*", zone_name = "koperasi.com" },  # Jika pakai custom domain
  { pattern = "koperasi.workers.dev/*", custom_domain = true }
]
```

---

## 🔑 Configure Secrets di Cloudflare

Secrets harus di-set untuk setiap sensitive data:

```bash
# Set secrets untuk production
wrangler secret put GOOGLE_PRIVATE_KEY --env production
# (Paste isi dari file JSON private_key field)

wrangler secret put GOOGLE_CLIENT_EMAIL --env production
# (Paste isi dari file JSON client_email)

wrangler secret put JWT_SECRET --env production
# (Paste JWT secret dari .env)

# Verify
wrangler secret list --env production
```

Output harus show:
```
┌──────────────────────┐
│ name                 │
├──────────────────────┤
│ GOOGLE_PRIVATE_KEY   │
│ GOOGLE_CLIENT_EMAIL  │
│ JWT_SECRET           │
└──────────────────────┘
```

---

## 📝 Update .env untuk Cloudflare

File `.env` lokal (untuk development):

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-jwt-secret-for-dev

# Google Sheets
GOOGLE_SHEET_ID=11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...YOUR_KEY...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=koperasi-app@your-project.iam.gserviceaccount.com
```

File `.env.production` (untuk production di Cloudflare):
```env
PORT=8787
NODE_ENV=production
GOOGLE_SHEET_ID=11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA
# GOOGLE_PRIVATE_KEY dan GOOGLE_CLIENT_EMAIL akan dari Cloudflare Secrets
```

---

## 🧪 Testing Locally Before Deploy

```bash
# Install dependencies
npm install

# Test Express server locally
npm run dev

# Access: http://localhost:3000

# In another terminal, test Wrangler:
wrangler dev

# Access: http://localhost:8787
```

Kedua port (3000 untuk npm dev, 8787 untuk wrangler dev) harus work.

---

## 🚀 Deploy to Cloudflare Workers

### Step 1: Ensure Git is setup
```bash
git add .
git commit -m "Ready for Cloudflare Workers deployment"
git push origin main
```

### Step 2: Login to Cloudflare
```bash
wrangler login
# Browser akan buka untuk authorize
```

### Step 3: Set Secrets
```bash
wrangler secret put GOOGLE_PRIVATE_KEY --env production
wrangler secret put GOOGLE_CLIENT_EMAIL --env production
wrangler secret put JWT_SECRET --env production
```

### Step 4: Deploy
```bash
# Deploy to production environment
wrangler deploy --env production

# Output akan show URL:
# ✓ Uploaded to Cloudflare
# Url: https://koperasi-YOUR_ACCOUNT.workers.dev
```

### Step 5: Verify Deployment
```bash
# Test health endpoint
curl https://koperasi-YOUR_ACCOUNT.workers.dev/api/health

# Should return:
# {"ok":true,"message":"Server is running"}
```

---

## 🔍 Monitoring After Deploy

### View Logs in Real-time
```bash
# Stream logs
wrangler tail --env production

# View on dashboard:
# https://dash.cloudflare.com → Workers & Pages → Your Worker → Logs
```

### Check Metrics
Go to: https://dash.cloudflare.com
- Click: **Workers & Pages**
- Click: **koperasi** (your worker)
- View: **Metrics** → Requests, Errors, CPU time

### Setup Error Alerts
1. Cloudflare Dashboard → **Notifications**
2. Create alert for Worker errors

---

## 🐛 Troubleshooting

### "Module not found"
```bash
# Ensure dependencies installed
npm install

# If still failing, clear cache:
rm -rf node_modules package-lock.json
npm install
```

### "Secret is not defined"
```bash
# Check secrets are set
wrangler secret list --env production

# If missing, add:
wrangler secret put SECRET_NAME --env production
```

### "Google Sheets connection fails"
```bash
# Check .env variables in wrangler.toml
# Verify GOOGLE_SHEET_ID is correct: 11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA
# Verify Service Account email is shared to spreadsheet
```

### "API returns 502 Bad Gateway"
- Check logs: `wrangler tail --env production`
- Check syntax errors: `node --check server.js`
- Redeploy: `wrangler deploy --env production`

### "Timeout errors"
- Google Sheets API can be slow
- Increase timeout if needed
- Check network connectivity

---

## ✅ Pre-Deployment Checklist

- [ ] Node.js v18+ installed
- [ ] `npm install` completed
- [ ] `wrangler` installed globally: `npm install -g wrangler`
- [ ] `.env` file updated with Google credentials
- [ ] `wrangler.toml` configured with correct GOOGLE_SHEET_ID
- [ ] Code tested locally: `npm run dev`
- [ ] GitHub repo created & code pushed
- [ ] Cloudflare account created
- [ ] Logged in to Cloudflare: `wrangler login`
- [ ] 3 secrets set in Cloudflare: GOOGLE_PRIVATE_KEY, GOOGLE_CLIENT_EMAIL, JWT_SECRET
- [ ] All tests pass locally

---

## 🎉 After Successful Deployment

1. **Backend URL**: `https://koperasi-YOUR_ACCOUNT.workers.dev`
2. **Test endpoint**: `https://koperasi-YOUR_ACCOUNT.workers.dev/api/health`
3. **Update frontend**: Update `app.js` API_BASE with this URL
4. **Deploy frontend**: Push to GitHub, Cloudflare Pages auto-deploys
5. **Test production**: Test login, kasir, barang modules
6. **Monitor**: Watch logs & metrics in Cloudflare Dashboard

---

## 💰 Cost After Deployment

```
Cloudflare Workers:    FREE (100k requests/day included)
Cloudflare Pages:      FREE (unlimited)
Google Sheets:         FREE
Custom Domain:         $10-15/year (optional)

Monthly Cost:          $0 🎉
```

If you exceed 100k requests/day (unlikely for small business):
- $0.50 per million requests

---

## 🚀 Next Steps

1. Complete **SETUP_GOOGLE_SHEETS.md** first
2. Follow steps in this file to deploy
3. Check **CLOUDFLARE_DEPLOYMENT_CHECKLIST.md** for progress tracking
4. Read **DEPLOY_CLOUDFLARE_WORKERS.md** for detailed guide with custom domain setup

---

**Status**: Ready to Deploy ✅  
**Spreadsheet ID**: `11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA`  
**Estimated Time**: 30 minutes to production 🚀
