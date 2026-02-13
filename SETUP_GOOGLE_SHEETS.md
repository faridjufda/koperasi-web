# Setup Google Sheets + Service Account - Panduan Lengkap

## 📋 Persyaratan
- Google Account (Gmail)
- Google Cloud Console access
- Project Koperasi (akan dibuat di step ini)

---

## 🔧 STEP 1: Buat Google Spreadsheet Baru

1. Buka https://sheets.google.com
2. Klik **"+ Blank spreadsheet"** atau **"New"** → **"Spreadsheet"**
3. Rename file menjadi **"Koperasi Database"** (atau nama lain)
4. **CATAT ID SPREADSHEET:**
   - Lihat URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
   - Copy nilai antara `/d/` dan `/edit`
   - Contoh: `1a2b3c4d5e6f7g8h9i0j`

---

## 🚀 STEP 2: Setup Google Cloud Service Account

### 2.1 Buat Google Cloud Project
1. Buka https://console.cloud.google.com
2. Di bagian atas, klik dropdown **project** 
3. Klik **"NEW PROJECT"**
4. Nama: `Koperasi` atau `koperasi-web`
5. Klik **CREATE**
6. Tunggu beberapa detik sampai project siap

### 2.2 Aktifkan Google Sheets API
1. Di Cloud Console, buka menu ☰ → **APIs & Services** → **Library**
2. Di search box, ketik `Google Sheets API`
3. Klik pada hasil pertama **"Google Sheets API"**
4. Klik tombol biru **"ENABLE"**
5. Tunggu sampai selesai

### 2.3 Buat Service Account
1. Buka menu ☰ → **APIs & Services** → **Credentials**
2. Klik **"+ CREATE CREDENTIALS"** → **"Service Account"**
3. Isi form:
   - Service account name: `koperasi-app`
   - Service account ID: (auto-generated)
   - Description: `Aplikasi Koperasi Web`
4. Klik **CREATE AND CONTINUE**
5. Grant roles (Opsional, bisa skip dengan klik **CONTINUE**)
6. Klik **DONE**

### 2.4 Generate Private Key JSON
1. Di halaman **Service Accounts**, cari account yang baru dibuat
   - Nama: `koperasi-app`
   - Email: `koperasi-app@{project-id}.iam.gserviceaccount.com`
2. Klik pada email tersebut (buka detail)
3. Tab **KEYS** → **Add Key** → **Create new key**
4. Pilih format **JSON**
5. Klik **CREATE**
6. File JSON otomatis ter-download
7. **SIMPAN FILE INI DENGAN AMAN** (berisi private key sensitif!)

### 2.5 Copy Credentials dari JSON
Buka file JSON yang sudah didownload, cari:

```json
{
  "type": "service_account",
  "project_id": "xyz-123456",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  "client_email": "koperasi-app@xyz-123456.iam.gserviceaccount.com",
  ...
}
```

**CATAT:**
- `client_email`: Full email service account
- `private_key`: Full value (termasuk `-----BEGIN` dan `-----END`)

---

## 📝 STEP 3: Share Spreadsheet ke Service Account

1. Buka spreadsheet "Koperasi Database" yang sudah dibuat di Step 1
2. Klik **Share** (tombol di kanan atas)
3. Paste `client_email` dari Step 2.5 ke field email
4. Pilih permission: **Editor**
5. Uncheck **"Notify people"** (service account tidak perlu notifikasi)
6. Klik **Share**
7. Spreadsheet sekarang bisa diakses oleh service account

---

## 🔑 STEP 4: Update File .env

1. Buka file `.env` di folder project koperasi
2. **GANTI** nilai berikut dengan data yang sudah dikumpulkan:

```env
PORT=3000
JWT_SECRET=koperasi-secret-key-2024-ganti-dengan-string-acak-panjang
GOOGLE_SPREADSHEET_ID={SPREADSHEET_ID dari Step 1}
GOOGLE_SERVICE_ACCOUNT_EMAIL={client_email dari Step 2.5}
GOOGLE_PRIVATE_KEY="{private_key dari Step 2.5}"
```

**⚠️ Contoh (jangan copy langsung, ganti dengan nilai asli):**
```env
PORT=3000
JWT_SECRET=my-super-secret-key-1a2b3c4d5e6f
GOOGLE_SPREADSHEET_ID=1a2b3c4d5e6f7g8h9i0j
GOOGLE_SERVICE_ACCOUNT_EMAIL=koperasi-app@project-xyz.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE...(full key)...-----END PRIVATE KEY-----\n"
```

⚠️ **CATATAN PENTING untuk Private Key:**
- Jika private key multi-line dari JSON file, **GANTI semua `\n` asli menjadi literal `\n` string**
- Atau copy paste seluruh value dari JSON key (sudah benar format)

---

## ✅ STEP 5: Test Koneksi

1. Terminal/CMD, jalankan:
```bash
cd c:\project koperasi
npm run dev
```

2. Buka browser ke http://localhost:3000
3. Jika error "Spreadsheet not found", double-check:
   - ID spreadsheet benar?
   - Service account email sudah di-share ke spreadsheet?
   - Private key format benar (dengan `-----BEGIN` dan `-----END`)?

4. Jika **BERHASIL**, akan ada log:
```
Koperasi web berjalan di http://localhost:3000
```

---

## 📊 Apa yang Terjadi Otomatis

Saat aplikasi pertama kali connect, akan **auto-create sheets** di spreadsheet:

| Sheet Name | Fungsi |
|-----------|--------|
| `admins` | Data login admin |
| `products` | Daftar barang (nama, harga, stok) |
| `transactions` | Riwayat transaksi penjualan |
| `transaction_items` | Detail item per transaksi |
| `movements` | Riwayat pergerakan stok (IN/OUT) |

Semuanya otomatis dibuat saat server run untuk pertama kali!

---

## 🐛 Troubleshooting

### Error: "GOOGLE_SPREADSHEET_ID belum diatur"
- Solusi: Isi GOOGLE_SPREADSHEET_ID di .env

### Error: "Spreadsheet not found"
- Solusi: 
  - Double check ID spreadsheet
  - Pastikan service account sudah di-share
  - Tunggu 30 detik setelah share, lalu restart server

### Error: "Invalid private key format"
- Solusi:
  - Pastikan private key dimulai dengan `-----BEGIN PRIVATE KEY-----`
  - Pastikan diakhiri dengan `-----END PRIVATE KEY-----\n`
  - Jika ada newline actual, ganti dengan `\n` string

### Error: "Credentials not valid"
- Solusi:
  - Re-generate private key JSON dari Google Cloud
  - Copy-paste ulang semua credentials

---

## 🎉 Selesai!

Aplikasi Anda sekarang terhubung dengan Google Sheets sebagai database.

**Next Step:** Jalankan `npm run create-admin` untuk buat akun login. Lihat file `DEPLOY.md` untuk deploy ke Cloudflare.
