const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let cachedToken = null; // { token, exp }

function nowSec() { return Math.floor(Date.now() / 1000); }
function base64UrlEncode(uint8Array) {
  // uint8Array -> binary string -> base64
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function stringToUint8Array(str) {
  return new TextEncoder().encode(str);
}
function base64UrlEncodeString(str) {
  return base64UrlEncode(stringToUint8Array(str));
}

async function importPrivateKeyFromPem(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\r/g, '');
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signWithPrivateKey(privateKeyPem, unsigned) {
  const key = await importPrivateKeyFromPem(privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    stringToUint8Array(unsigned)
  );
  return base64UrlEncode(new Uint8Array(signature));
}

async function getAccessTokenFromServiceAccount(privateKeyPem, clientEmail) {
  if (cachedToken && cachedToken.exp > nowSec() + 30) return cachedToken.token;

  const iat = nowSec();
  const exp = iat + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  };

  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = await signWithPrivateKey(privateKeyPem, unsigned);
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) throw new Error('Gagal mendapatkan access_token dari Google');

  cachedToken = { token: data.access_token, exp: nowSec() + (data.expires_in || 3600) };
  return cachedToken.token;
}

async function getSpreadsheetMeta(spreadsheetId, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error('Gagal membaca metadata spreadsheet');
  return r.json();
}

async function addSheet(spreadsheetId, title, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const body = { requests: [{ addSheet: { properties: { title } } }] };
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gagal membuat sheet ${title}`);
  return r.json();
}

async function setHeaderRow(spreadsheetId, sheetTitle, headers, accessToken) {
  const range = `${sheetTitle}!1:1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const body = { values: [headers] };
  const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Gagal set header row');
  return r.json();
}

// New: apply premium formatting and conditional rules for all sheets
async function formatProductsSheet(spreadsheetId, sheetTitle, accessToken) {
  // First, get all sheet IDs
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const sheets = meta.sheets || [];
  const sheetMap = {};
  for (const s of sheets) {
    sheetMap[s.properties.title] = s.properties.sheetId;
  }

  const requests = [];

  // === PRODUCTS SHEET ===
  const prodId = sheetMap[sheetTitle] ?? sheetMap['products'] ?? 0;
  
  // Freeze header row
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: prodId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Header formatting — gradient blue
  requests.push({
    repeatCell: {
      range: { sheetId: prodId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { 
        backgroundColor: { red: 0.24, green: 0.25, blue: 0.95 },
        textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        padding: { top: 6, bottom: 6 }
      }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'
    }
  });

  // Column widths
  const widths = [100, 220, 120, 120, 80, 80, 160];
  for (let i = 0; i < widths.length; i++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: prodId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: widths[i] },
        fields: 'pixelSize'
      }
    });
  }

  // Number format for price columns (C=2 and D=3)  
  requests.push({
    repeatCell: {
      range: { sheetId: prodId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  });

  // Alternating row colors
  requests.push({
    addBanding: {
      bandedRange: {
        range: { sheetId: prodId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 7 },
        rowProperties: {
          headerColor: { red: 0.24, green: 0.25, blue: 0.95 },
          firstBandColor: { red: 1, green: 1, blue: 1 },
          secondBandColor: { red: 0.95, green: 0.96, blue: 1 }
        }
      }
    }
  });

  // Conditional: stock <= minStock → red background
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: prodId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=AND(E2<=F2,E2>0)' }] },
          format: { backgroundColor: { red: 1, green: 0.93, blue: 0.87 } }
        }
      },
      index: 0
    }
  });

  // Conditional: stock = 0 → red text bold  
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: prodId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }],
        booleanRule: {
          condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: '0' }] },
          format: { 
            backgroundColor: { red: 1, green: 0.85, blue: 0.85 },
            textFormat: { bold: true, foregroundColor: { red: 0.8, green: 0.1, blue: 0.1 } }
          }
        }
      },
      index: 0
    }
  });

  // === FORMAT OTHER SHEETS ===
  const otherSheets = ['transactions', 'movements', 'transaction_items', 'notifications', 'admins'];
  for (const name of otherSheets) {
    const sid = sheetMap[name];
    if (sid === undefined) continue;

    // Freeze header
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount'
      }
    });

    // Header styling
    const colors = {
      transactions: { red: 0.06, green: 0.73, blue: 0.51 },    // green
      movements: { red: 0.96, green: 0.62, blue: 0.04 },       // orange
      transaction_items: { red: 0.4, green: 0.33, blue: 0.8 },  // purple
      notifications: { red: 0.93, green: 0.27, blue: 0.27 },   // red
      admins: { red: 0.3, green: 0.3, blue: 0.35 },            // dark gray
    };
    const bg = colors[name] || { red: 0.3, green: 0.3, blue: 0.8 };

    requests.push({
      repeatCell: {
        range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { 
          backgroundColor: bg,
          textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }},
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    });

    // Banding
    requests.push({
      addBanding: {
        bandedRange: {
          range: { sheetId: sid, startRowIndex: 0 },
          rowProperties: {
            headerColor: bg,
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.97, green: 0.97, blue: 0.98 }
          }
        }
      }
    });
  }

  // Currency format for transactions.total (col F=5)
  if (sheetMap['transactions'] !== undefined) {
    requests.push({
      repeatCell: {
        range: { sheetId: sheetMap['transactions'], startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  // Currency format for transaction_items (price=4, subtotal=5)
  if (sheetMap['transaction_items'] !== undefined) {
    requests.push({
      repeatCell: {
        range: { sheetId: sheetMap['transaction_items'], startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 6 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
  if (!r.ok) {
    console.warn('formatProductsSheet failed', await r.text());
    return null;
  }
  return r.json();
}

async function getValues(spreadsheetId, range, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (r.status === 404) return { values: [] };
  if (!r.ok) throw new Error('Gagal membaca values');
  return r.json();
}

async function updateValues(spreadsheetId, range, values, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const body = { values };
  const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Gagal update values');
  return r.json();
}

async function appendValues(spreadsheetId, range, values, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const body = { values };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Gagal append values');
  return r.json();
}

function rowsToObjects(headerRow = [], rows = []) {
  const headers = headerRow.map((h) => String(h || '').trim());
  return (rows || []).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] === undefined ? '' : r[i]; });
    return obj;
  });
}

function objectsToRows(headerRow = [], objs = []) {
  return objs.map((o) => headerRow.map((h) => o[h] === undefined ? '' : String(o[h])));
}

export {
  getAccessTokenFromServiceAccount,
  getSpreadsheetMeta,
  addSheet,
  setHeaderRow,
  formatProductsSheet,
  getValues,
  updateValues,
  appendValues,
  rowsToObjects,
  objectsToRows,
};