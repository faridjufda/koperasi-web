# Deployment Guide — Koperasi AI Chat (Cloudflare Workers + Google Sheets)

## Overview
This project consists of:
- **Frontend**: Static HTML/CSS/JS in `public/` (deployable to Cloudflare Pages, Vercel, etc.)
- **Backend**: Cloudflare Worker (serverless) in `src/worker/` + FastAPI PoC in `backend/`
- **Database**: Google Sheets (via service account)
- **AI**: Google Generative AI (Gemini)

---

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **Google Cloud Project** with:
   - Google Sheets API enabled
   - Google Generative AI API (or AI Studio) enabled
   - Service account JSON with Sheets editor access
3. **GitHub** repo (for CI/CD via Actions)
4. **wrangler** CLI installed: `npm install -g wrangler@2`

---

## Step 1: Prepare Google Sheets

### Create Service Account
1. Go to Google Cloud Console → Create Service Account
2. Grant "Editor" role on Google Sheets API scope
3. Download JSON key
4. Share your spreadsheet with the service account email: `{service-account}@{project}.iam.gserviceaccount.com`

### Sheet Structure
Ensure these sheets exist with headers (or run `backend/seed_spreadsheet.py` to auto-create):
- `admins` (id, username, password, passwordHash, isActive)
- `products` (id, name, sellPrice, buyPrice, stock, minStock, updatedAt)
- `transactions` (id, createdAt, cashier, memberName, paymentMethod, total)
- `transaction_items` (transactionId, productId, productName, qty, price, subtotal)
- `movements` (logs of stock changes)
- `notifications` (low-stock alerts)

---

## Step 2: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key

---

## Step 3: Deploy Cloudflare Worker

### Option A: Automatic (GitHub Actions)

1. Add GitHub Secrets in repo Settings → Secrets and variables → Actions:
   - `CF_API_TOKEN` (Cloudflare API token; create at https://dash.cloudflare.com/profile/api-tokens with Workers:edit)
   - `GEMINI_API_KEY`
   - `JWT_SECRET` (e.g., `openssl rand -hex 32`)
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (paste full PEM; GitHub will handle newlines)
   - `GOOGLE_SPREADSHEET_ID`

2. Push to `main` branch:
   ```bash
   git add .
   git commit -m "deploy: push to main"
   git push origin main
   ```

3. Monitor Actions tab for deployment job

### Option B: Manual with wrangler

1. Login to Cloudflare:
   ```bash
   wrangler login
   ```

2. Set secrets (interactively):
   ```bash
   wrangler secret put GEMINI_API_KEY
   wrangler secret put JWT_SECRET
   wrangler secret put GOOGLE_CLIENT_EMAIL
   wrangler secret put GOOGLE_PRIVATE_KEY
   wrangler secret put GOOGLE_SPREADSHEET_ID
   ```

3. Publish:
   ```bash
   wrangler publish --env production
   ```

---

## Step 4: Deploy Frontend (Optional)

### Cloudflare Pages
```bash
wrangler pages deploy public --project-name koperasi-web
```

### Vercel
```bash
npm install -g vercel
vercel --prod --name koperasi-web
```

---

## Step 5: Test Endpoints

Replace `<WORKER_DOMAIN>` with your actual Worker domain (e.g., `koperasi-web-prod.{account}.workers.dev`).

### Login
```bash
curl -s -X POST https://<WORKER_DOMAIN>/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
Response: `{ "token": "eyJ..." }`

### Check Stock
```bash
TOKEN="<from_login>"
curl -s -X GET https://<WORKER_DOMAIN>/api/cek-stok \
  -H "Authorization: Bearer $TOKEN"
```

### Call Gemini
```bash
TOKEN="<from_login>"
curl -s -X POST https://<WORKER_DOMAIN>/api/gemini \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Ringkas stok Buku Tulis 50 pcs"}'
```

### Monthly Analysis
```bash
TOKEN="<from_login>"
curl -s -X GET "https://<WORKER_DOMAIN>/api/analisis-bulanan?month=3&year=2026&top_n=5" \
  -H "Authorization: Bearer $TOKEN"
```

### Stock Prediction
```bash
TOKEN="<from_login>"
curl -s -X GET "https://<WORKER_DOMAIN>/api/prediksi-stok?nama=Buku%20Tulis&days=90" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Step 6: FastAPI Backend (Optional, for local dev)

If you want to run backend locally for development:

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Copy .env.example to .env and fill values
cp .env.example .env

# Seed example data (optional)
python seed_spreadsheet.py

# Run
uvicorn main:app --reload --port 8000
```

---

## Troubleshooting

### Worker deployment fails
- Check `wrangler publish` output for error details
- Ensure `GOOGLE_PRIVATE_KEY` is in correct PEM format (-----BEGIN PRIVATE KEY-----)
- Test locally: `wrangler dev`

### Gemini API returns errors
- Verify API key is valid and enabled in Google Cloud
- Check quota usage at https://console.cloud.google.com
- Monitor costs; consider rate-limiting in Worker

### Sheet reads are slow
- Sheets API has rate limits. Consider caching or pagination
- Monitor usage in Google Cloud Console

### Auth fails
- Ensure `JWT_SECRET` matches between Worker and backend
- Check token expiration in `index.mjs` (default 4 hours)

---

## Production Checklist

- [ ] Set `GOOGLE_PRIVATE_KEY` securely (never commit to repo)
- [ ] Rotate `JWT_SECRET` regularly
- [ ] Enable logging (e.g., Logflare integration via `LOGFLARE_URL`)
- [ ] Monitor Gemini API usage and costs
- [ ] Set rate-limiting rules in Worker
- [ ] Test endpoints with real data
- [ ] Document custom business logic (if any)

---

## Additional Notes

- **Cost**: Cloudflare Workers free tier = 100k requests/day; Gemini free tier = limited requests/month
- **Scaling**: For high volume, consider batch operations or caching layer
- **Security**: Use HTTPS only, validate all inputs, rotate secrets regularly

---

For more help, see:
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Google Generative AI](https://ai.google.dev/)
