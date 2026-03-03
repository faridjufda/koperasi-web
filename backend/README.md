FastAPI backend PoC for Koperasi — Google Sheets as DB + Gemini

Quick start
1. Copy `.env.example` to `.env` and fill `SERVICE_ACCOUNT_FILE`, `SPREADSHEET_ID`, `GEMINI_API_KEY`, `JWT_SECRET`.
2. Create a Python venv and install:

```bash
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

3. Run locally:

```bash
uvicorn main:app --reload --port 8000
```

Endpoints
- POST `/login` — body `{ "username": "...", "password": "..." }` -> returns JWT
- GET `/cek-stok/{nama}` — returns stock info (optionally use `?use_ai=1` to get Gemini answer)
- POST `/api/gemini` — protected (Bearer JWT). Body `{ "prompt": "..." }` -> returns Gemini response

Notes
- Shares same spreadsheet structure as Worker: sheets `admins`, `products`, `transactions`, etc.
- Service account JSON file should be shared with the spreadsheet (grant view/edit as needed).
 
Deployment
 - Railway: add project, connect repo, set `SERVICE_ACCOUNT_FILE` (upload file), set other environment variables (`SPREADSHEET_ID`, `GEMINI_API_KEY`, `JWT_SECRET`). Railway will use `Procfile` to start the app.
 - Render: create a web service, set start command `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, add environment variables and upload service account via Secrets (or store in object storage and read path).

Seeding example data
 - Run the seed script to populate example `admins`, `products`, `transactions`, and `transaction_items`:

```bash
venv\Scripts\activate
python backend/seed_spreadsheet.py
```

Notes & security
 - Keep `SERVICE_ACCOUNT_FILE` private. For some hosts you can store the JSON contents in an environment variable and write to disk at startup.
 - For production, migrate to proper password hashing (bcrypt) and avoid storing plaintext passwords. This PoC uses SHA-256 with a salt for compatibility with the existing worker.
 - Monitor API usage to control Gemini costs. Send only numeric summaries to Gemini, not full datasets.
