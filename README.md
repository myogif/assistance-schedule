# Assistance Schedule — Modular Multi-Niche Autopost Service

Layanan otomatisasi publikasi konten editorial multi-niche ke Instagram dengan dukungan ekstraksi berita otomatis, analisis berbasis AI, pembuatan poster bergaya majalah editorial (1080x1350), dan integrasi multi-antarmuka (REST API, Telegram Bot, serta CLI).

---

## Daftar Isi

1. [Gambaran Umum & Fitur Utama](#gambaran-umum--fitur-utama)
2. [Arsitektur & Alur Kerja Pipeline](#arsitektur--alur-kerja-pipeline)
3. [Struktur Proyek](#struktur-proyek)
4. [Prasyarat Sistem (Prerequisites)](#prasyarat-sistem-prerequisites)
5. [Langkah Instalasi & Setup](#langkah-instalasi--setup)
6. [Panduan Penggunaan](#panduan-penggunaan)
   - [Mode 1: REST API & Swagger UI](#mode-1-rest-api--swagger-ui)
   - [Mode 2: Telegram Bot](#mode-2-telegram-bot)
   - [Mode 3: Command-Line Interface (CLI Auto)](#mode-3-command-line-interface-cli-auto)
7. [Referensi Variabel Lingkungan (.env)](#referensi-variabel-lingkungan-env)
8. [Manajemen Database & Prompt Versioning](#manajemen-database--prompt-versioning)
9. [Troubleshooting & Tanya Jawab (FAQ)](#troubleshooting--tanya-jawab-faq)

---

## Gambaran Umum & Fitur Utama

**Assistance Schedule** dirancang untuk media editorial dan kreator konten yang membutuhkan pipeline terstandarisasi mulai dari penangkapan berita hingga terbit di Instagram dalam format visual berkualitas tinggi.

### Fitur Utama:
- **Arsitektur Multi-Niche**: Mengelola template prompt, konfigurasi akun, dan aturan editorial secara terisolasi per niche (default: `finance` untuk pasar modal IDX & makroekonomi).
- **Web Scraper Cerdas (Playwright)**: Mampu mengekstrak judul, konten isi artikel, dan metadata dari portal berita Indonesia secara headless dengan pembersihan elemen noise otomatis.
- **Ekstraksi Entitas & Sudut Pandang Editorial (OpenAI GPT-4o)**:
  - Mengkategorikan berita (contoh: `IDX MARKET WATCH`, `PERBANKAN`, `EMITEN`, `MAKRO`).
  - Menghasilkan headline kapital yang padat dan menarik (8–10 kata).
  - Mengidentifikasi tokoh publik (Presiden, Menteri, CEO) dan kode saham IDX (4 huruf).
  - Menyusun caption siap terbit lengkap dengan hook, ringkasan, analisis urgensi, CTA, sumber, dan hashtag.
- **Generator Poster Editorial (1080x1350 / 4:5 IG Feed)**:
  - Estetika editorial modern bergaya Bloomberg Markets & Financial Times Weekend (latar belakang navy gelap `#060B14`, aksen teks cyan neon `#00D2FF`, tipografi tengah tebal).
  - Mendukung endpoint gambar lokal (Gemini image endpoint) dengan fallback otomatis ke model OpenAI DALL-E / Image API.
  - Normalisasi dan manipulasi gambar presisi menggunakan **Sharp**.
- **Autopublish Instagram Terintegrasi (Zernio API)**:
  - Auto-deteksi ID akun Instagram terhubung.
  - Presigned upload S3 dan penjadwalan/publikasi feed secara langsung.
- **Penyimpanan Berbasis ORM Sequelize**:
  - Fleksibel menggunakan SQLite (default tanpa setup server terpisah) atau PostgreSQL/MySQL untuk skala produksi.
  - Riwayat prompt dengan pelacakan versi (*versioning*).
  - Pencatatan log komprehensif (*post logs*) mencakup status, input, output ekstraksi, path poster, hingga tautan Instagram.
- **Tiga Antarmuka Penggunaan Fleksibel**:
  - **REST API Express**: Dilengkapi dokumentasi interaktif OpenAPI / Swagger UI.
  - **Telegram Bot (Telegraf)**: Kontrol penuh via chat (kirim tautan berita, cek status, manipulasi prompt langsung dari chat).
  - **CLI Interaktif & Non-Interaktif (`scripts/auto.js`)**: Ideal untuk cron job atau eksekusi manual via terminal.

---

## Arsitektur & Alur Kerja Pipeline

Berikut adalah alur data dari penerimaan artikel hingga posting di Instagram:

```
[ Input: URL Berita / Teks Mentah ]
                │
                ▼
      ┌──────────────────┐
      │  Scraper Module  │  (Playwright: mengambil DOM, membuang iklan/noise)
      └─────────┬────────┘
                ▼
      ┌──────────────────┐
      │   AI Extractor   │  (OpenAI: kategori, headline, emiten saham, caption)
      └─────────┬────────┘
                ▼
      ┌──────────────────┐
      │ Image Generator  │  (Local Gemini Endpoint / OpenAI Fallback + Sharp 1080x1350)
      └─────────┬────────┘
                ▼
      ┌──────────────────┐
      │ Zernio Publisher │  (S3 Presign Upload -> Instagram API Publish)
      └─────────┬────────┘
                ▼
 [ Output: Feed Instagram Terbit + PostLog Tersimpan di DB ]
```

---

## Struktur Proyek

```
assistance-schedule/
├── config/
│   └── database.js               # Konfigurasi koneksi Sequelize (SQLite / PostgreSQL)
├── database/
│   ├── migrations/               # Skrip migrasi tabel (Niches, Prompts, BotConfigs, PostLogs)
│   └── seeders/                  # Data awal (Niche finance dan template prompt dasar)
├── data/                         # Direktori penyimpanan file database SQLite (.sqlite)
├── output/                       # Direktori penyimpanan poster gambar hasil generasi
├── scripts/
│   └── auto.js                   # CLI runner interaktif / non-interaktif
├── src/
│   ├── app.js                    # Inisialisasi Express app, middleware, & static routes
│   ├── server.js                 # Entry point HTTP server REST API
│   ├── bot/
│   │   ├── index.js              # Inisialisasi Telegraf bot
│   │   └── handlers.js           # Handler command Telegram & listener pesan berita
│   ├── controllers/              # Controller untuk endpoint REST API
│   ├── docs/
│   │   └── swagger.js            # Spesifikasi OpenAPI 3.0 / Swagger UI
│   ├── middlewares/              # Validator skema, handler 404, dan error handler sentral
│   ├── models/                   # Model Sequelize (Niche, Prompt, BotConfig, PostLog)
│   ├── routes/                   # Routing Express API v1 (/posts, /niches, /system, dll.)
│   └── services/
│       ├── aiExtractor.js        # Ekstraksi entitas & framing berita via OpenAI
│       ├── imageGenerator.js     # Generasi visual poster & Sharp post-processing
│       ├── pipelineService.js    # Orkestrator alur kerja end-to-end autopost
│       ├── promptService.js      # Pengambilan & manipulasi prompt dinamis dari DB
│       ├── scraper.js            # Scraper web berbasis Playwright Chromium
│       └── zernioPublisher.js    # Integrasi API Zernio untuk publikasi Instagram
├── .env.example                  # Template variabel lingkungan
├── package.json                  # Dependensi dan skrip proyek
└── README.md                     # Dokumentasi utama proyek
```

---

## Prasyarat Sistem (Prerequisites)

Sebelum menjalankan aplikasi, pastikan sistem Anda telah terpasang:

1. **Node.js**: Versi `18.x` atau `20.x` LTS ke atas.
2. **NPM**: Versi `9.x` atau lebih baru.
3. **Chromium (Playwright)**: Browser dependency untuk modul web scraper.
4. **Database**:
   - Secara default menggunakan **SQLite3** (file otomatis dibuat di `./data/assistance.sqlite`).
   - Opsional: **PostgreSQL** atau **MySQL** jika diatur pada `.env`.
5. **Kredensial & Kunci API yang Dibutuhkan**:
   - **OpenAI API Key**: Diperlukan untuk ekstraksi teks (GPT-4o) dan generasi gambar fallback.
   - **Telegram Bot Token**: Dari [@BotFather](https://t.me/BotFather) jika menggunakan mode bot.
   - **Zernio API Key**: Dari platform [Zernio](https://zernio.com) yang telah terhubung ke akun Instagram Business / Creator.
   - *(Opsional)* **Local Image API Endpoint**: Jika menggunakan generator gambar lokal / proxy Gemini.

---

## Langkah Instalasi & Setup

### 1. Klon Repositori & Pasang Dependensi

```bash
git clone https://github.com/username/assistance-schedule.git
cd assistance-schedule
npm install
```

### 2. Pasang Browser Playwright

Playwright membutuhkan browser Chromium untuk melakukan scraping artikel:

```bash
npx playwright install chromium
# Atau jika berjalan di server Linux (Ubuntu/Debian) yang memerlukan dependensi OS:
# npx playwright install --with-deps chromium
```

### 3. Konfigurasi Environment (`.env`)

Salin file `.env.example` menjadi `.env`, lalu lengkapi nilai variabel di dalamnya:

```bash
cp .env.example .env
```

Buka file `.env` dan atur minimal variabel berikut:

```env
DB_DIALECT=sqlite
DB_STORAGE=./data/assistance.sqlite

OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456789:ABCDefghIJKLmnopQRSTUvwxyz
ZERNIO_API_KEY=zernio_live_xxxxxxxxxxxx

ACTIVE_NICHE=finance
PORT=4000
```

### 4. Menjalankan Migrasi dan Seeder Database

Buat tabel database dan isi data awal untuk niche `finance` beserta template prompt AI:

```bash
# Jalankan migrasi tabel
npm run db:migrate

# Jalankan seeder data awal (Niche finance & prompt default)
npm run db:seed
```

> **Tips:** Jika ingin mereset seluruh database dari awal, gunakan:
> ```bash
> npm run db:reset
> ```

---

## Panduan Penggunaan

Aplikasi ini dapat dioperasikan melalui 3 metode sesuai kebutuhan:

### Mode 1: REST API & Swagger UI

Gunakan mode ini untuk mengintegrasikan layanan dengan backend lain, web dashboard, atau sistem penjadwalan eksternal.

#### Menjalankan Server:
```bash
npm run server
# atau
npm start
```

Server akan aktif di `http://localhost:4000`.

#### Mengakses Swagger UI:
Buka peramban (browser) dan akses:
```
http://localhost:4000/api-docs/
```
Spesifikasi JSON OpenAPI dapat diakses di `http://localhost:4000/api-docs.json`.

#### Direktori Media Publik:
Gambar poster yang berhasil digenerate disajikan secara statis pada:
```
http://localhost:4000/media/<nama-file.png>
```

#### Endpoint Utama:

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `POST` | `/api/v1/posts/pipeline` | Menjalankan pipeline autopost lengkap (bisa dry-run atau skip-publish) |
| `GET` | `/api/v1/posts` | Mengambil riwayat post log dengan pagination & filter status |
| `GET` | `/api/v1/posts/:id` | Detail log eksekusi post tertentu |
| `POST` | `/api/v1/posts/:id/retry` | Menjalankan ulang pipeline yang gagal |
| `GET` | `/api/v1/niches` | Mengambil daftar seluruh niche aktif |
| `GET` | `/api/v1/niches/:code/prompts` | Mengambil seluruh template prompt pada niche tertentu |
| `PUT` | `/api/v1/niches/:code/prompts/:type` | Memperbarui teks prompt (otomatis menaikkan versi) |
| `POST` | `/api/v1/niches/:code/prompts/:type/reset` | Me-reset prompt ke versi default |
| `GET` | `/api/v1/system/status` | Pengecekan kesehatan sistem, koneksi database, dan API key |
| `GET` | `/api/v1/system/stats` | Statistik total posting, rasio sukses, dan metrik sistem |

#### Contoh Request Eksekusi Pipeline via cURL:
```bash
curl -X POST http://localhost:4000/api/v1/posts/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "nicheCode": "finance",
    "url": "https://market.bisnis.com/read/20261011/7/123456/ihsg-menguat-ditopang-saham-bbca",
    "dryRun": false,
    "skipPublish": false
  }'
```

---

### Mode 2: Telegram Bot

Mode ini memungkinkan anggota tim editorial memicu pembuatan konten langsung dari aplikasi Telegram di ponsel atau desktop.

#### Menjalankan Bot:
```bash
npm run bot
```

#### Pembatasan Pengguna (Whitelist Keamanan):
Atur username atau ID pengguna yang diizinkan pada `.env`:
```env
TELEGRAM_ALLOWED_USERS=username1,username2,123456789
```
*Jika dikosongkan, bot dapat diakses oleh siapa saja yang mengetahui username bot.*

#### Cara Penggunaan di Telegram:
1. **Memicu Autopost via URL Berita**:
   Cukup kirimkan tautan artikel berita finansial ke chat bot:
   ```text
   https://market.bisnis.com/read/20261011/7/123456/ihsg-menguat
   ```
2. **Memicu Autopost via Teks Langsung**:
   Kirimkan potongan teks atau ringkasan berita ke dalam chat bot.
3. **Modifier Cepat**:
   - Awali pesan dengan `!dryrun` untuk menguji ekstraksi tanpa generate gambar dan tanpa publish:
     ```text
     !dryrun https://market.bisnis.com/...
     ```
   - Awali pesan dengan `!skip` untuk generate poster gambar tetapi melewati tahap publish ke Instagram:
     ```text
     !skip https://market.bisnis.com/...
     ```

#### Perintah Manajemen Bot:
- `/start` atau `/help`: Menampilkan pesan selamat datang, panduan penggunaan, dan ringkasan perintah.
- `/status`: Memeriksa status kesehatan sistem, koneksi database, active niche, dan ketersediaan API key.
- `/prompts`: Menampilkan daftar prompt yang aktif beserta versinya.
- `/getprompt <type>`: Membaca teks system prompt tertentu (tipe: `entity_extraction`, `visual_image`, `caption_template`).
  *Contoh:* `/getprompt entity_extraction`
- `/setprompt <type> <isi_prompt_baru>`: Memperbarui teks system prompt secara instan dan menaikkan nomor versi di database.
  *Contoh:* `/setprompt caption_template Gunakan nada bicara yang lebih santai...`
- `/resetprompt <type>`: Mengembalikan prompt tertentu ke versi baseline bawaan sistem.

---

### Mode 3: Command-Line Interface (CLI Auto)

Gunakan script CLI untuk pengujian lokal, eksekusi cepat dari terminal, atau dihubungkan ke cron job server.

#### Menjalankan Mode Interaktif:
```bash
npm run auto
# atau
node scripts/auto.js
```
Script akan menampilkan banner dan meminta Anda memilih:
- `[1]` Memasukkan URL Berita (akan discrape secara otomatis).
- `[2]` Memasukkan Teks Berita Langsung.

#### Menjalankan Mode Non-Interaktif / Flag Argumen:

```bash
# 1. Eksekusi dengan URL berita
node scripts/auto.js --url="https://market.bisnis.com/read/..."

# 2. Mode uji coba (Dry Run - ekstraksi AI saja, tanpa generate gambar & tanpa publish)
node scripts/auto.js --url="https://market.bisnis.com/..." --dry-run

# 3. Generate poster gambar tetapi jangan publish ke Instagram
node scripts/auto.js --url="https://market.bisnis.com/..." --skip-publish

# 4. Eksekusi menggunakan teks langsung
node scripts/auto.js --text="IHSG ditutup menguat 1.2% ke level 7.800 didorong oleh pembelian bersih asing pada saham perbankan BBCA dan BBRI."

# 5. Menentukan niche secara eksplisit
node scripts/auto.js --url="https://..." --niche=finance
```

---

## Referensi Variabel Lingkungan (.env)

Berikut penjelasan lengkap setiap variabel konfigurasi yang didukung:

| Kategori | Variabel | Wajib? | Nilai Bawaan | Deskripsi |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | `DB_DIALECT` | Opsional | `sqlite` | Dialek database (`sqlite`, `postgres`, `mysql`). |
| | `DB_STORAGE` | Opsional | `./data/assistance.sqlite` | Lokasi file database SQLite jika `DB_DIALECT=sqlite`. |
| | `DB_HOST` | Opsional | `127.0.0.1` | Host database (untuk PostgreSQL / MySQL). |
| | `DB_PORT` | Opsional | `5432` | Port database. |
| | `DB_NAME` | Opsional | `assistance_schedule` | Nama database. |
| | `DB_USER` | Opsional | `postgres` | Username database. |
| | `DB_PASSWORD` | Opsional | *(kosong)* | Password database. |
| | `DB_LOGGING` | Opsional | `false` | Cetak query SQL ke konsol jika bernilai `true`. |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Wajib (Bot) | *(kosong)* | Token bot Telegram dari @BotFather. |
| | `TELEGRAM_ALLOWED_USERS` | Opsional | *(kosong)* | Daftar username (tanpa @) atau ID angka dipisahkan koma untuk membatasi akses bot. |
| | `ACTIVE_NICHE` | Opsional | `finance` | Kode niche aktif default yang digunakan bot dan CLI. |
| **OpenAI** | `OPENAI_API_KEY` | Wajib | *(kosong)* | API Key resmi dari OpenAI. |
| | `TEXT_MODEL` | Opsional | `gpt-4o` | Model untuk ekstraksi entitas dan penyusunan caption. |
| | `OPENAI_MODEL` | Opsional | `gpt-4o` | Alias alternatif model OpenAI. |
| | `VISION_MODEL` | Opsional | `gpt-4o` | Model vision OpenAI untuk analisis gambar. |
| | `IMAGE_MODEL` | Opsional | `gpt-image-2.5-sunburst` | Model fallback untuk pembuatan gambar poster editorial. |
| | `IMAGE_QUALITY` | Opsional | `standard` | Kualitas gambar (`standard` / `hd`). |
| | `IMAGE_SIZE` | Opsional | `1088x1360` | Resolusi generasi awal sebelum dinormalisasi ke 1080x1350. |
| **Local Image** | `LOCAL_IMAGE_API_URL` | Opsional | `http://localhost:20128/...` | Endpoint lokal/proxy untuk pembuatan gambar berbasis Gemini. |
| | `LOCAL_IMAGE_API_KEY` | Opsional | *(default token)* | API key otentikasi endpoint gambar lokal. |
| | `LOCAL_IMAGE_MODEL` | Opsional | `ag/gemini-3.1-flash-image` | Model gambar pada endpoint lokal. |
| **Instagram / Zernio** | `ZERNIO_API_KEY` | Wajib (Publish) | *(kosong)* | API Key dari Zernio untuk publikasi Instagram. |
| | `ZERNIO_INSTAGRAM_ACCOUNT_ID` | Opsional | *(auto-detect)* | ID akun Instagram Zernio. Jika kosong, sistem otomatis mengambil akun Instagram pertama. |
| **Scraper** | `PLAYWRIGHT_HEADLESS` | Opsional | `true` | Menjalankan Playwright tanpa GUI (`true`) atau dengan GUI (`false`). |
| | `SCRAPE_MAX_RETRIES` | Opsional | `2` | Jumlah percobaan ulang ketika scraping halaman gagal. |
| | `DEBUG_SCRAPER` | Opsional | `false` | Log detail ekstraksi elemen DOM scraper. |
| **Server** | `PORT` | Opsional | `4000` | Port HTTP listener Express REST API. |
| | `CORS_ORIGIN` | Opsional | `*` | Konfigurasi CORS origin (`*` atau domain tertentu). |

---

## Manajemen Database & Prompt Versioning

Sistem ini menerapkan prinsip **Database-backed Prompts**:
- Prompt tidak di-*hardcode* di dalam kode program, melainkan tersimpan di tabel `Prompts` pada database.
- Tiga tipe prompt utama per niche:
  1. `entity_extraction`: Menginstruksikan AI untuk mengekstrak entitas saham, tokoh, headline, dan kategori.
  2. `visual_image`: Mengarahkan komposisi visual poster 1080x1350 bergaya Bloomberg / FT.
  3. `caption_template`: Template struktur caption postingan Instagram (`{{hook}}`, `{{summary}}`, `{{cta}}`, dsb.).
- **Versioning**: Setiap kali prompt diperbarui (melalui endpoint API `PUT /api/v1/niches/:code/prompts/:type` atau bot command `/setprompt`), sistem otomatis menaikkan nomor versi (`version = version + 1`).
- Anda dapat mengembalikan prompt ke standar awal kapan saja menggunakan tombol reset di API atau perintah `/resetprompt`.

---

## Troubleshooting & Tanya Jawab (FAQ)

### 1. Error: `Executable doesn't exist at .../playwright/chromium...`
**Penyebab**: Binary browser Playwright belum diunduh ke sistem.
**Solusi**: Jalankan perintah berikut di terminal:
```bash
npx playwright install chromium
```
Pada Linux Ubuntu/Debian server tanpa GUI, gunakan:
```bash
npx playwright install --with-deps chromium
```

### 2. Error: `SQLITE_CANTOPEN: unable to open database file`
**Penyebab**: Folder `data/` belum ada atau pengguna tidak memiliki izin tulis (*write permission*).
**Solusi**:
```bash
mkdir -p data
chmod 755 data
```
Pastikan path pada `DB_STORAGE` di file `.env` mengarah ke folder yang valid.

### 3. Error: `ZERNIO_API_KEY is not configured in environment variables`
**Penyebab**: Kunci API Zernio belum diisi di `.env`.
**Solusi**: Jika Anda hanya ingin menguji pembuatan poster dan ekstraksi berita tanpa langsung mempublikasikannya ke Instagram, sertakan argumen `--skip-publish` atau `--dry-run` pada CLI, atau gunakan prefix `!skip` pada bot Telegram.

### 4. Akun Instagram Tidak Ditemukan oleh Zernio
**Penyebab**: Kunci API Zernio belum dihubungkan ke akun Instagram mana pun di dashboard Zernio.
**Solusi**:
1. Masuk ke dashboard Zernio dan hubungkan akun Instagram Business/Creator Anda.
2. Jika memiliki beberapa akun di satu API key, tentukan ID akun secara manual pada `.env`:
   ```env
   ZERNIO_INSTAGRAM_ACCOUNT_ID=acc_xxxxxxxxxxxx
   ```

### 5. Bot Telegram Menolak Pesan (`⛔ Akses ditolak`)
**Penyebab**: Variabel `TELEGRAM_ALLOWED_USERS` diaktifkan dan username/ID akun pengirim tidak terdaftar.
**Solusi**: Tambahkan username Telegram Anda (tanpa tanda `@`) atau User ID numerik ke variabel `TELEGRAM_ALLOWED_USERS` di file `.env` (pisahkan dengan koma jika lebih dari satu), lalu restart bot.

### 6. Endpoint Gambar Lokal (Local Image API) Tidak Dapat Dihubungi
**Penyebab**: Service lokal di port `20128` mati atau belum dijalankan.
**Solusi**: Sistem telah dirancang dengan mekanisme *graceful fallback*. Apabila endpoint lokal tidak merespons, pipeline akan otomatis beralih menggunakan OpenAI Image API (DALL-E) menggunakan `OPENAI_API_KEY` Anda.

---

## Lisensi

Proyek ini dirilis di bawah lisensi [ISC License](LICENSE).
