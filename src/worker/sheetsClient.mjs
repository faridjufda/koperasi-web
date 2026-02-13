import { SignJWT, importPKCS8 } from 'jose';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let cachedToken = null; // { token, exp }

function nowSec() { return Math.floor(Date.now() / 1000); }

async function getAccessTokenFromServiceAccount(privateKeyPem, clientEmail) {
  if (cachedToken && cachedToken.exp > nowSec() + 30) return cachedToken.token;

  const iat = nowSec();
  const exp = iat + 3600;

  const jwtPayload = {
    iss: clientEmail,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  };

  const key = await importPKCS8(privateKeyPem, 'RS256');
  const signed = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
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