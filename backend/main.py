import os
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from dotenv import load_dotenv
import jwt
import time

from sheets_client import find_product_by_name, get_admin_by_username
from gemini_client import generate_text
from sheets_client import get_transactions, get_transaction_items, get_all_products
import hashlib

load_dotenv()

SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')
JWT_SECRET = os.getenv('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'
TOKEN_EXP_SECONDS = 60 * 60 * 4

app = FastAPI(title='Koperasi AI Backend (Sheets + Gemini)')

class LoginPayload(BaseModel):
    username: str
    password: str

class GeminiPayload(BaseModel):
    prompt: str
    model: str = None
    temperature: float = 0.2
    maxOutputTokens: int = 512

# Simple auth dependency
async def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail='Missing Authorization header')
    if not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Invalid Authorization header')
    token = authorization.split(' ', 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail='Invalid token')
    if payload.get('exp', 0) < time.time():
        raise HTTPException(status_code=401, detail='Token expired')
    return payload

@app.post('/login')
async def login(body: LoginPayload):
    admin = get_admin_by_username(SPREADSHEET_ID, body.username)
    if not admin or not admin.get('isActive'):
        raise HTTPException(status_code=401, detail='Unauthorized')
    # Hashing (SHA-256) with a simple salt to compare against stored passwordHash
    def hash_password(pw: str) -> str:
        s = (pw or '') + ':koperasi-salt-2026'
        return hashlib.sha256(s.encode('utf-8')).hexdigest()

    stored_plain = str(admin.get('password') or '')
    stored_hash = str(admin.get('passwordHash') or '')
    input_hash = hash_password(body.password)

    # Accept if input matches stored plain OR matches stored hash
    if body.password != stored_plain and input_hash != stored_hash:
        raise HTTPException(status_code=401, detail='Unauthorized')
    now = int(time.time())
    token = jwt.encode({'username': admin['username'], 'role': 'admin', 'iat': now, 'exp': now + TOKEN_EXP_SECONDS}, JWT_SECRET, algorithm=JWT_ALGO)
    return {'token': token}

@app.get('/cek-stok/{nama_produk}')
async def cek_stok(nama_produk: str, use_ai: int = 0):
    prod = find_product_by_name(SPREADSHEET_ID, nama_produk)
    if not prod:
        raise HTTPException(status_code=404, detail='Produk tidak ditemukan')
    response = {'product': prod}
    if use_ai:
        prompt = f"""
        Stok produk {prod['name']} adalah {prod['stock']}.
        Beri jawaban singkat, profesional, dan rekomendasi jika perlu restock.
        """
        try:
            ai = generate_text(prompt, temperature=0.2, max_output_tokens=200)
            response['ai'] = ai
        except Exception as e:
            response['ai_error'] = str(e)
    return response


@app.get('/analisis-bulanan')
async def analisis_bulanan(month: int, year: int, top_n: int = 5):
    """Aggregate monthly sales from sheets and return summary + top/slow products."""
    txs = get_transactions(SPREADSHEET_ID)
    items = get_transaction_items(SPREADSHEET_ID)
    # build set of transaction IDs that match month/year
    from datetime import datetime

    def parse_date(s):
        if not s:
            return None
        s2 = str(s).replace(' WITA', '').strip()
        # try several common formats
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y'):
            try:
                return datetime.strptime(s2, fmt)
            except Exception:
                continue
        # last resort: try ISO
        try:
            return datetime.fromisoformat(s2)
        except Exception:
            return None

    valid_tx_ids = set()
    for t in txs:
        created = parse_date(t.get('createdAt') or t.get('created_at') or '')
        if not created:
            continue
        if created.month == int(month) and created.year == int(year):
            tid = t.get('id') or t.get('transactionId')
            if tid:
                valid_tx_ids.add(str(tid))

    # aggregate by productId/productName
    agg = {}
    total_revenue = 0.0
    total_qty = 0
    for it in items:
        if str(it.get('transactionId') or it.get('trxId') or '') not in valid_tx_ids:
            continue
        pid = it.get('productId') or it.get('product_id') or it.get('product') or it.get('productName')
        pname = it.get('productName') or it.get('product_name') or pid
        qty = 0
        try:
            qty = int(float(it.get('qty') or it.get('quantity') or 0))
        except Exception:
            qty = 0
        price = 0.0
        try:
            price = float(it.get('subtotal') or it.get('price') or 0)
        except Exception:
            price = 0.0
        total_qty += qty
        total_revenue += price
        key = str(pid) + '|' + str(pname)
        if key not in agg:
            agg[key] = {'productId': pid, 'productName': pname, 'qty': 0, 'revenue': 0.0}
        agg[key]['qty'] += qty
        agg[key]['revenue'] += price

    items_list = list(agg.values())
    items_list.sort(key=lambda x: x['qty'], reverse=True)

    # get product stocks to help recommendations
    products = get_all_products(SPREADSHEET_ID)
    stock_map = {str(p.get('id') or p.get('ID') or p.get('Id') or p.get('id')): p for p in products}

    # top and slow
    top = items_list[:top_n]
    slow = sorted([i for i in items_list if i['qty'] > 0], key=lambda x: x['qty'])[:top_n]

    # recommendations: restock if stock <= minStock (if available)
    recs = []
    for it in items_list:
        pid = str(it['productId'])
        prod = stock_map.get(pid) or None
        if prod:
            try:
                stock = int(float(prod.get('stock') or 0))
            except Exception:
                stock = 0
            try:
                minstock = int(float(prod.get('minStock') or prod.get('min_stock') or 0))
            except Exception:
                minstock = 0
            if stock <= minstock:
                recs.append({'productId': pid, 'productName': it['productName'], 'stock': stock, 'minStock': minstock, 'reason': 'stock <= minStock'})

    return {'month': month, 'year': year, 'total_qty': total_qty, 'total_revenue': total_revenue, 'top': top, 'slow': slow, 'recommendations': recs}


@app.get('/prediksi-stok/{nama_produk}')
async def prediksi_stok(nama_produk: str, days: int = 90):
    """Estimate when product stock will be depleted using average daily sales over `days` window."""
    from datetime import datetime, timedelta
    # find product
    prod = find_product_by_name(SPREADSHEET_ID, nama_produk)
    if not prod:
        raise HTTPException(status_code=404, detail='Produk tidak ditemukan')
    stock = int(prod.get('stock') or 0)

    # gather items in window
    txs = get_transactions(SPREADSHEET_ID)
    items = get_transaction_items(SPREADSHEET_ID)

    def parse_date(s):
        if not s:
            return None
        s2 = str(s).replace(' WITA', '').strip()
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y'):
            try:
                return datetime.strptime(s2, fmt)
            except Exception:
                continue
        try:
            return datetime.fromisoformat(s2)
        except Exception:
            return None

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)
    valid_tx_ids = set()
    for t in txs:
        created = parse_date(t.get('createdAt') or t.get('created_at') or '')
        if not created:
            continue
        # assume created in local tz; compare by date-only
        if created >= cutoff:
            tid = t.get('id') or t.get('transactionId')
            if tid:
                valid_tx_ids.add(str(tid))

    total_qty = 0
    for it in items:
        if str(it.get('transactionId') or it.get('trxId') or '') not in valid_tx_ids:
            continue
        pname = it.get('productName') or it.get('product_name') or ''
        if str(pname).strip().lower() != nama_produk.strip().lower():
            continue
        try:
            q = int(float(it.get('qty') or it.get('quantity') or 0))
        except Exception:
            q = 0
        total_qty += q

    avg_per_day = total_qty / days if days > 0 else 0
    if avg_per_day > 0:
        days_left = stock / avg_per_day
        import math
        days_left = math.floor(days_left)
        estimated_empty_date = (now + timedelta(days=days_left)).date().isoformat()
    else:
        days_left = None
        estimated_empty_date = None

    return {'product': prod, 'stock': stock, 'window_days': days, 'total_sold_in_window': total_qty, 'avg_per_day': avg_per_day, 'days_left': days_left, 'estimated_empty_date': estimated_empty_date}

@app.post('/api/gemini')
async def api_gemini(payload: GeminiPayload, user=Depends(get_current_user)):
    try:
        text = generate_text(payload.prompt, model=payload.model, temperature=payload.temperature, max_output_tokens=payload.maxOutputTokens)
        return {'ok': True, 'text': text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), reload=True)
