# Cloudflare Workers Deployment - Checklist Cepat

**Spreadsheet ID Anda**: `11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA`

---

## ✅ Pre-Deployment Checklist

### Step 1: Selesaikan SETUP_GOOGLE_SHEETS.md
- [ ] Create Google Cloud Project
- [ ] Enable Google Sheets API
- [ ] Create Service Account
- [ ] Generate Private Key JSON
- [ ] Share spreadsheet ke service account
- [ ] Update `.env` dengan credentials

**Waktu**: 15 menit

### Step 2: Setup Git & GitHub
```bash
# Initialize Git
git init
git add .
git commit -m "Initial commit - Koperasi Web"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/koperasi-web.git
git branch -M main
git push -u origin main
```

- [ ] GitHub repo created
- [ ] Code pushed to GitHub

**Waktu**: 5 menit

### Step 3: Install Wrangler
```bash
# Install globally
npm install -g wrangler

# Verify
wrangler --version

# Login
wrangler login
```

- [ ] Wrangler installed
- [ ] Logged in to Cloudflare

**Waktu**: 5 menit

### Step 4: Set Cloudflare Secrets
```bash
# Set these 3 secrets (copy dari .env)

# 1. Google Private Key
wrangler secret put GOOGLE_PRIVATE_KEY --env production

# 2. Google Client Email
wrangler secret put GOOGLE_CLIENT_EMAIL --env production

# 3. JWT Secret
wrangler secret put JWT_SECRET --env production

# Verify
wrangler secret list --env production
```

- [ ] GOOGLE_PRIVATE_KEY set
- [ ] GOOGLE_CLIENT_EMAIL set
- [ ] JWT_SECRET set

**Waktu**: 3 menit

### Step 5: Update Backend Config
```bash
# Edit wrangler.toml
# Make sure GOOGLE_SHEET_ID is correct:
# GOOGLE_SHEET_ID = "11rzIkhogRXuHzUHrvOi3J6xs4s_bO4QplcF5_nHrIMA"
```

- [ ] wrangler.toml updated
- [ ] GOOGLE_SHEET_ID correct

**Waktu**: 2 menit

### Step 6: Deploy Backend
```bash
# Test locally
wrangler dev

# Deploy to production
wrangler deploy --env production
```

- [ ] Local testing works
- [ ] Backend deployed

**Waktu**: 5 menit

### Step 7: Deploy Frontend
```bash
# Update app.js API_BASE dengan Workers URL
# Commit and push to GitHub
git add .
git commit -m "Update API_BASE for Cloudflare Workers"
git push origin main

# Then go to Cloudflare Dashboard > Pages
# Connect GitHub repo > Deploy
```

- [ ] app.js updated with Workers URL
- [ ] Code pushed to GitHub
- [ ] Frontend deployed to Cloudflare Pages

**Waktu**: 10 menit

### Step 8: Final Testing
```bash
# Test health endpoint
curl https://koperasi-YOUR_ACCOUNT.workers.dev/api/health

# Open frontend
https://koperasi.pages.dev

# Create admin & test login
npm run create-admin -- admin123 koperasi2024
```

- [ ] API health check passes
- [ ] Frontend loads
- [ ] Login works
- [ ] Create product works
- [ ] Create transaction works
- [ ] Google Sheets synced

**Waktu**: 5 menit

---

## 📊 Total Setup Time: ~50 minutes

1. Google Sheets Setup: 15 min
2. GitHub Setup: 5 min
3. Wrangler Install: 5 min
4. Cloudflare Secrets: 3 min
5. Config Updates: 2 min
6. Backend Deploy: 5 min
7. Frontend Deploy: 10 min
8. Final Testing: 5 min

---

## 💰 Cost After Setup

- **Cloudflare Workers**: FREE (100k requests/day included)
- **Cloudflare Pages**: FREE (unlimited bandwidth)
- **Google Sheets**: FREE
- **Total Monthly Cost**: $0 🎉

---

## 🆘 If Something Goes Wrong

1. **Check logs**: `wrangler tail --env production`
2. **Check Cloudflare Dashboard**: View metrics & errors
3. **Test locally first**: `npm run dev` before deploying
4. **Re-set secrets if needed**: `wrangler secret put NAME --env production`
5. **Rollback if needed**: `wrangler rollback`

---

## 🚀 Next Action

**START HERE**: Open `SETUP_GOOGLE_SHEETS.md` and complete Step 1-5 first!

After that, use this checklist as you follow `DEPLOY_CLOUDFLARE_WORKERS.md`.

Good luck! 🎉
