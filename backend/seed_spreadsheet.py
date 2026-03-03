"""Seed example rows into the Google Sheets used by the app.

Usage:
  - Copy SERVICE_ACCOUNT_FILE and SPREADSHEET_ID into environment or .env
  - python seed_spreadsheet.py
"""
import os
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build

load_dotenv()
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SERVICE_ACCOUNT_FILE = os.getenv('SERVICE_ACCOUNT_FILE')
SPREADSHEET_ID = os.getenv('SPREADSHEET_ID')

if not SERVICE_ACCOUNT_FILE or not SPREADSHEET_ID:
    print('Set SERVICE_ACCOUNT_FILE and SPREADSHEET_ID in environment or .env')
    raise SystemExit(1)

creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
service = build('sheets', 'v4', credentials=creds, cache_discovery=False)
sheet = service.spreadsheets()

# Helper to append rows
def append(range_name, rows):
    body = {'values': rows}
    resp = sheet.values().append(spreadsheetId=SPREADSHEET_ID, range=range_name, valueInputOption='RAW', body=body).execute()
    return resp

# Seed admins (header: username, password, passwordHash, isActive)
admins = [
    ['username', 'password', 'passwordHash', 'isActive'],
    ['admin', 'admin123', '', 'true']
]
append('admins!A1', admins)
print('Seeded admins')

# Seed products (id,name,sellPrice,buyPrice,stock,minStock,updatedAt)
products = [
    ['id','name','sellPrice','buyPrice','stock','minStock','updatedAt'],
    ['BRG-001','Buku Tulis', '5000', '3000', '50', '10', '2026-03-01 00:00:00 WITA'],
    ['BRG-002','Pensil', '2000', '1000', '120', '30', '2026-03-01 00:00:00 WITA'],
]
append('products!A1', products)
print('Seeded products')

# Seed transactions (id,createdAt,cashier,memberName,paymentMethod,total)
transactions = [
    ['id','createdAt','cashier','memberName','paymentMethod','total'],
    ['TRX-1','2026-03-01 08:00:00 WITA','admin','Siswa A','cash','15000'],
]
append('transactions!A1', transactions)
print('Seeded transactions')

# Seed transaction_items (transactionId,productId,productName,qty,price,subtotal)
items = [
    ['transactionId','productId','productName','qty','price','subtotal'],
    ['TRX-1','BRG-001','Buku Tulis','2','5000','10000'],
    ['TRX-1','BRG-002','Pensil','2','2500','5000'],
]
append('transaction_items!A1', items)
print('Seeded transaction_items')

print('Done seeding. Make sure service account email has access to the spreadsheet (Share -> <service-account>@...')
