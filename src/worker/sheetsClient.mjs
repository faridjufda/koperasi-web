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

// New: apply formatting and conditional rules for products sheet
async function formatProductsSheet(spreadsheetId, sheetTitle, accessToken) {
  const requests = [];

  // Freeze header row and set column widths
  requests.push({
    updateSheetProperties: {
      properties: { title: sheetTitle, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Set header formatting (bold, background)
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: { red: 0.85, green: 0.94, blue: 1 }, textFormat: { bold: true, fontSize: 12 } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)'
    }
  });

  // Column widths for first 7 columns (A-G)
  const widths = [90, 240, 120, 120, 100, 100, 160];
  for (let i = 0; i < widths.length; i++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: widths[i] },
        fields: 'pixelSize'
      }
    });
  }

  // Number format for price columns (C and D)
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '¤#,##0' } } },
      fields: 'userEnteredFormat.numberFormat'
    }
  });

  // Conditional formatting: highlight rows where stock <= minStock (columns E and F)
  requests.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId: 0, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=INDIRECT("E"&ROW())<=INDIRECT("F"&ROW())' }] },
          format: { backgroundColor: { red: 1, green: 0.9, blue: 0.8 } }
        }
      },
      index: 0
    }
  });

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
  if (!r.ok) {
    // don't throw — formatting is a nicety
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
  getValues,
  updateValues,
  appendValues,
  rowsToObjects,
  objectsToRows,
};