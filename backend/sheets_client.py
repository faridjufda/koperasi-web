import os
from google.oauth2 import service_account
from googleapiclient.discovery import build

_SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

def _get_creds():
    sa_file = os.getenv('SERVICE_ACCOUNT_FILE')
    if not sa_file:
        raise RuntimeError('SERVICE_ACCOUNT_FILE is not set')
    creds = service_account.Credentials.from_service_account_file(sa_file, scopes=_SCOPES)
    return creds

def get_values(spreadsheet_id, range_name):
    creds = _get_creds()
    service = build('sheets', 'v4', credentials=creds, cache_discovery=False)
    sheet = service.spreadsheets()
    resp = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    return resp.get('values', [])

def find_product_by_name(spreadsheet_id, name):
    # assume header row exists in products sheet
    vals = get_values(spreadsheet_id, 'products!A1:G')
    if not vals or len(vals) < 2:
        return None
    header = [h.strip() for h in vals[0]]
    rows = vals[1:]
    # find index of name and stock if present
    try:
        idx_name = header.index('name')
    except ValueError:
        # fallback: second column
        idx_name = 1
    try:
        idx_stock = header.index('stock')
    except ValueError:
        idx_stock = 4
    for r in rows:
        if len(r) > idx_name and str(r[idx_name]).strip().lower() == name.strip().lower():
            return {
                'id': r[0] if len(r) > 0 else '',
                'name': r[idx_name] if len(r) > idx_name else '',
                'sellPrice': r[2] if len(r) > 2 else '',
                'buyPrice': r[3] if len(r) > 3 else '',
                'stock': int(r[idx_stock]) if len(r) > idx_stock and r[idx_stock] != '' else 0
            }
    return None

def get_admin_by_username(spreadsheet_id, username):
    vals = get_values(spreadsheet_id, 'admins!A1:D')
    if not vals or len(vals) < 2:
        return None
    header = [h.strip() for h in vals[0]]
    rows = vals[1:]
    try:
        idx_username = header.index('username')
    except ValueError:
        idx_username = 0
    try:
        idx_password = header.index('password')
    except ValueError:
        idx_password = 1
    try:
        idx_hash = header.index('passwordHash')
    except ValueError:
        idx_hash = 2
    try:
        idx_active = header.index('isActive')
    except ValueError:
        idx_active = 3
    for r in rows:
        u = r[idx_username] if len(r) > idx_username else ''
        if str(u).strip().lower() == username.strip().lower():
            return {
                'username': u,
                'password': r[idx_password] if len(r) > idx_password else '',
                'passwordHash': r[idx_hash] if len(r) > idx_hash else '',
                'isActive': str(r[idx_active]).strip().lower() != 'false'
            }
    return None


def _rows_to_objects(header_row, rows):
    header = [h.strip() for h in header_row]
    objs = []
    for r in rows:
        obj = {}
        for i, h in enumerate(header):
            obj[h] = r[i] if i < len(r) else ''
        objs.append(obj)
    return objs


def get_transactions(spreadsheet_id):
    vals = get_values(spreadsheet_id, 'transactions!A1:Z')
    if not vals or len(vals) < 2:
        return []
    header = vals[0]
    rows = vals[1:]
    return _rows_to_objects(header, rows)


def get_transaction_items(spreadsheet_id):
    vals = get_values(spreadsheet_id, 'transaction_items!A1:Z')
    if not vals or len(vals) < 2:
        return []
    header = vals[0]
    rows = vals[1:]
    return _rows_to_objects(header, rows)


def get_all_products(spreadsheet_id):
    vals = get_values(spreadsheet_id, 'products!A1:Z')
    if not vals or len(vals) < 2:
        return []
    header = vals[0]
    rows = vals[1:]
    return _rows_to_objects(header, rows)
