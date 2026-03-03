# 🏪 Koperasi AI Chat System

AI-powered inventory management system for school cooperatives using Cloudflare Workers, Google Sheets, and Google Generative AI (Gemini).

## 🎯 Features

✅ **Real-time Stock Checking** — Query stock levels via natural language  
✅ **AI Analysis** — Monthly sales analysis, trends, and insights using Gemini  
✅ **Stock Prediction** — Estimate when products will be depleted  
✅ **Secure Authentication** — JWT-based admin access control  
✅ **Serverless Deployment** — Cloudflare Workers for zero-server management  
✅ **Google Sheets Integration** — Data storage without database overhead  

## 📋 Project Structure

```
.
├── public/                 # Frontend (HTML/CSS/JS)
│   ├── chat.html          # AI Chat UI
│   ├── index.html         # Main page
│   ├── app.js             # App logic
│   └── styles.css         # Styles
├── src/
│   └── worker/            # Cloudflare Worker (serverless backend)
│       ├── index.mjs      # Main handler
│       ├── geminiClient.mjs # Gemini API client
│       └── sheetsClient.mjs # Google Sheets client
├── backend/               # FastAPI (optional, for local dev)
│   ├── main.py           # FastAPI app
│   ├── sheets_client.py  # Sheets helper
│   ├── gemini_client.py  # Gemini helper
│   ├── seed_spreadsheet.py # Populate sample data
│   └── requirements.txt   # Python deps
├── .github/
│   └── workflows/
│       └── deploy-wrangler.yml # Auto-deploy on push to main
├── wrangler.toml         # Cloudflare Worker config
├── package.json          # Node deps
├── DEPLOYMENT.md         # Full deployment guide
└── README.md            # This file
```

## 🚀 Quick Start

### For Everyone: Set Up Google Sheets + Service Account

1. **Create service account** in Google Cloud Console
2. **Download JSON key** and note the email (`{account}@...iam.gserviceaccount.com`)
3. **Create Google Sheets workbook** and share with the service account email
4. **Note Spreadsheet ID** from URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/...`

### Option 1: Deploy to Production (Cloudflare Workers via GitHub Actions)

1. **Add GitHub Secrets** (Settings → Secrets & variables → Actions):
   - `CF_API_TOKEN` — Cloudflare API token (with Workers:edit scope)
   - `GEMINI_API_KEY` — From Google AI Studio
   - `JWT_SECRET` — Random long string `openssl rand -hex 32`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` — Full PEM from service account JSON
   - `GOOGLE_SPREADSHEET_ID`

2. **Push to main**:
   ```bash
   git add .
   git commit -m "deploy: production"
   git push origin main
   ```

3. **Monitor** Actions tab for deployment

4. **Test**:
   ```bash
   # Login
   curl -X POST https://<WORKER_DOMAIN>/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123"}'
   
   # Ask Gemini
   curl -X POST https://<WORKER_DOMAIN>/api/api/gemini \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Ringkas stok produk"}'
   ```

### Option 2: Local Development (FastAPI + Wrangler Dev)

#### FastAPI Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Fill: SERVICE_ACCOUNT_FILE, SPREADSHEET_ID, GEMINI_API_KEY, JWT_SECRET

# Seed sample data
python seed_spreadsheet.py

# Run
uvicorn main:app --reload --port 8000
```

#### Cloudflare Worker (Dev Mode)
```bash
wrangler dev
# Open http://localhost:8787
```

## 📝 API Endpoints

All protected endpoints require `Authorization: Bearer <JWT_TOKEN>`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | `{ username, password }` → `{ token }` |
| `/api/health` | GET | Health check |
| `/api/products` | GET | List all products |
| `/api/products` | POST | Create/update product |
| `/api/cek-stok/{nama}` | GET | Check stock for product |
| `/api/gemini` | POST | Ask AI `{ prompt }` → `{ text }` |
| `/api/analisis-bulanan` | GET | Monthly analysis `?month=3&year=2026` |
| `/api/prediksi-stok` | GET | Stock prediction `?nama=Buku%20Tulis&days=90` |
| `/api/transactions` | GET | List transactions (latest 100) |
| `/api/transactions` | POST | Create transaction (complex, see worker code) |
| `/api/movements` | GET | Stock movements/audit log |

**Example: Get JWT Token**
```bash
curl -X POST https://your-worker.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# Response: { "token": "eyJ0eXAiOiJKV1QiLCJhbGc..." }
```

**Example: Ask Gemini**
```bash
curl -X POST https://your-worker.workers.dev/api/gemini \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Analisis penjualan apa bulan lalu?","temperature":0.2,"maxOutputTokens":256}'
```

## 🛠️ Configuration

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `GOOGLE_SPREADSHEET_ID` | Sheets ID | Which sheet to use |
| `GOOGLE_CLIENT_EMAIL` | Service account | Authenticate to Sheets |
| `GOOGLE_PRIVATE_KEY` | Service account | Sign JWT for Sheets |
| `GEMINI_API_KEY` | Google AI Studio | Call Gemini API |
| `JWT_SECRET` | Random, keep secret | Sign login tokens |

### Secrets Storage

- **Development**: Use `.env` file (Git-ignored)
- **Production (Worker)**: Via `wrangler secret put` or GitHub Actions
- **Backend (FastAPI)**: Use `.env` or environment variables

## 🔒 Security Notes

- ✅ All sensitive endpoints protected by JWT
- ✅ Password auto-upgraded to SHA-256 hash on first login
- ✅ Secrets never committed to repo
- ✅ CORS restricted to allowed origins
- ⚠️ Consider upgrading to bcrypt/argon2 for production
- ⚠️ Rotate `JWT_SECRET` and API keys regularly

## 🧪 Testing

### Manual Test (cURL)
See API Endpoints section above

### Postman Collection
(TODO: Export from API calls above)

### Browser
Open `public/chat.html` after deploying, or access at `https://your-worker.workers.dev/chat.html`

## 📊 Monitoring

- **Cloudflare Dashboard**: View request logs, errors, latency
- **Google Cloud**: Monitor Sheets API quota and Gemini usage
- **Worker Logs**: `wrangler tail`

## 💰 Costs

- **Cloudflare Workers**: 100k req/day free, then $0.50/million
- **Google Sheets API**: 500 req/100s free quota
- **Gemini API**: Free tier available; check https://ai.google.dev

## 📚 Further Reading

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Google Generative AI](https://ai.google.dev/)
- [Full Deployment Guide](./DEPLOYMENT.md)
- [Backend README](./backend/README.md)

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Push and open PR: `git push origin feature/my-feature`
4. GitHub Actions will auto-deploy to staging once merged to `main`

## 📄 License

ISC — Free to use and modify

---

**Last Updated**: March 2026  
**Status**: Production Ready ✅
