# Assistance Schedule — Modular Multi-Niche Autopost Service

Layanan otomatisasi publikasi konten editorial multi-niche ke Instagram dengan dukungan ekstraksi berita otomatis, analisis berbasis AI, pembuatan poster bergaya majalah editorial (1080×1350), dan integrasi multi-antarmuka (REST API, Telegram Bot, serta CLI).

---

## Daftar Isi

1. [Gambaran Umum & Fitur Utama](#1-gambaran-umum--fitur-utama)
2. [Arsitektur & Alur Pipeline](#2-arsitektur--alur-pipeline)
3. [Struktur Proyek](#3-struktur-proyek)
4. [Instalasi & Setup](#4-instalasi--setup)
5. [Cara Menjalankan](#5-cara-menjalankan)
6. [Panduan Penggunaan](#6-panduan-penggunaan)
   - [Mode 1 — REST API & Swagger UI](#mode-1--rest-api--swagger-ui)
   - [Mode 2 — Telegram Bot (Private Chat)](#mode-2--telegram-bot-private-chat)
   - [Mode 3 — Telegram Bot di Grup](#mode-3--telegram-bot-di-grup)
   - [Mode 4 — CLI Auto](#mode-4--cli-auto)
7. [Referensi Variabel Lingkungan](#7-referensi-variabel-lingkungan)
8. [Manajemen Prompt & Versioning](#8-manajemen-prompt--versioning)
9. [Project Knowledge](#9-project-knowledge)
10. [Troubleshooting & FAQ](#10-troubleshooting--faq)

---

## 1. Gambaran Umum & Fitur Utama

**Assistance Schedule** dirancang untuk media editorial dan kreator konten yang membutuhkan pipeline terstandarisasi mulai dari penangkapan berita hingga terbit di Instagram dalam format visual berkualitas tinggi.

| Fitur | Detail |
|---|---|
| **Multi-Niche** | Prompt, konfigurasi, dan log terisolasi per niche (default: `finance`) |
| **Web Scraper** | Playwright Chromium — headless, toleran noise DOM, auto-retry |
| **AI Extractor** | GPT-4o — kategori, headline kapital, emiten IDX, tokoh publik, caption |
| **Image Generator** | Local Gemini endpoint (utama) → OpenAI fallback; Sharp normalisasi ke 1080×1350 |
| **Autopublish** | Zernio API → presigned S3 upload → Instagram Feed |
| **Database** | Sequelize ORM — SQLite (default) / PostgreSQL / MySQL; prompt versioning |
| **Antarmuka** | REST API + Swagger UI, Telegram Bot (private + grup), CLI interaktif/non-interaktif |

---

## 2. Arsitektur & Alur Pipeline

```
[ Input: URL Berita / Teks Mentah ]
                │
                ▼
      ┌─────────────────────┐
      │  scraper.js         │  Playwright: ambil DOM, buang iklan/noise
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │  aiExtractor.js     │  OpenAI GPT-4o: kategori, headline, emiten, caption
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │  imageGenerator.js  │  Local Gemini / OpenAI → Sharp 1080×1350
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │  zernioPublisher.js │  S3 Presign Upload → Instagram API Publish
      └──────────┬──────────┘
                 ▼
 [ PostLog tersimpan di DB + Feed Instagram Terbit ]
```

Semua langkah diorkestrasikan oleh `pipelineService.js` dengan progress callback opsional (dipakai Telegram Bot untuk edit pesan secara real-time).

---

## 3. Struktur Proyek

```
assistance-schedule/
├── config/
│   └── database.js               # Konfigurasi koneksi Sequelize
├── database/
│   ├── migrations/               # DDL tabel: Niches, Prompts, BotConfigs, PostLogs
│   └── seeders/                  # Data awal niche finance + 3 prompt default
├── data/                         # File SQLite tersimpan di sini
├── output/                       # Poster gambar hasil generasi
├── scripts/
│   └── auto.js                   # CLI runner interaktif / non-interaktif
├── src/
│   ├── app.js                    # Express app + middleware + static /media
│   ├── server.js                 # Entry point REST API
│   ├── bot/
│   │   ├── index.js              # Inisialisasi Telegraf + registrasi handler
│   │   └── handlers.js           # authMiddleware, command handlers, article handler
│   ├── controllers/              # Controller endpoint REST API
│   ├── docs/swagger.js           # Spesifikasi OpenAPI 3.0
│   ├── middlewares/              # Validator schema, 404, error handler sentral
│   ├── models/                   # Sequelize models: Niche, Prompt, BotConfig, PostLog
│   ├── routes/                   # Express router v1
│   └── services/
│       ├── pipelineService.js    # Orkestrator pipeline end-to-end
│       ├── aiExtractor.js        # Ekstraksi entitas via OpenAI
│       ├── imageGenerator.js     # Generate + normalisasi poster
│       ├── promptService.js      # Ambil & manipulasi prompt dari DB
│       ├── scraper.js            # Scraper Playwright
│       └── zernioPublisher.js    # Integrasi Zernio → Instagram
├── .env.example
├── package.json
├── tutorial.md                   # Tutorial penggunaan bot detail
└── README.md
```

---

## 4. Instalasi & Setup

### 4.1 Prasyarat

| Kebutuhan | Versi Minimum |
|---|---|
| Node.js | 18.x LTS |
| npm | 9.x |
| Chromium (via Playwright) | otomatis diunduh |
| OpenAI API Key | — |
| Telegram Bot Token | dari @BotFather |
| Zernio API Key | dari zernio.com |

### 4.2 Clone & Install Dependensi

```bash
git clone https://github.com/username/assistance-schedule.git
cd assistance-schedule
npm install
```

### 4.3 Install Browser Playwright

```bash
# Lokal / macOS / Windows
npx playwright install chromium

# Linux server (Ubuntu/Debian) — sertakan OS dependencies
npx playwright install --with-deps chromium
```

### 4.4 Konfigurasi Environment

```bash
cp .env.example .env
```

Edit `.env`, isi minimal variabel berikut:

```env
# === WAJIB ===
TELEGRAM_BOT_TOKEN=123456789:ABCDefghIJKLmnopQRSTUvwxyz
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
ZERNIO_API_KEY=zernio_live_xxxxxxxxxxxx

# === DATABASE (default SQLite, tidak perlu server terpisah) ===
DB_DIALECT=sqlite
DB_STORAGE=./data/assistance.sqlite

# === BOT BEHAVIOUR ===
ACTIVE_NICHE=finance

# === AKSES KONTROL (kosongkan = izinkan semua) ===
TELEGRAM_ALLOWED_USERS=
TELEGRAM_ALLOWED_GROUPS=
```

> **PostgreSQL/MySQL:** Ganti `DB_DIALECT` dan isi `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

### 4.5 Migrasi & Seed Database

```bash
# Buat tabel
npm run db:migrate

# Isi data awal (niche finance + 3 prompt default)
npm run db:seed
```

Reset database dari nol:

```bash
npm run db:reset
```

### 4.6 Setup Telegram Bot (Grup)

Jika bot akan dipakai di **grup Telegram**, matikan privacy mode di BotFather agar bot bisa membaca pesan biasa (bukan hanya `/command`):

```
1. Buka chat dengan @BotFather
2. Kirim: /setprivacy
3. Pilih bot Anda
4. Pilih: Disable
```

Tanpa langkah ini, bot di grup hanya merespons perintah yang diawali `/`.

---

## 5. Cara Menjalankan

| Mode | Perintah |
|---|---|
| REST API server | `npm start` atau `npm run server` |
| Telegram Bot | `npm run bot` |
| CLI interaktif | `npm run auto` |

Ketiganya berdiri sendiri — jalankan sesuai kebutuhan, bisa bersamaan di proses terpisah.

---

## 6. Panduan Penggunaan

### Mode 1 — REST API & Swagger UI

Server aktif di `http://localhost:4000`.

**Swagger UI:** `http://localhost:4000/api-docs/`
**Media statis (poster):** `http://localhost:4000/media/<filename.png>`

#### Endpoint Utama

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/v1/posts/pipeline` | Jalankan pipeline autopost (dryRun / skipPublish optional) |
| `GET` | `/api/v1/posts` | Riwayat post log (pagination + filter status) |
| `GET` | `/api/v1/posts/:id` | Detail satu log eksekusi |
| `POST` | `/api/v1/posts/:id/retry` | Ulangi pipeline yang gagal |
| `GET` | `/api/v1/niches` | Daftar niche aktif |
| `GET` | `/api/v1/niches/:code/prompts` | Prompt aktif per niche |
| `PUT` | `/api/v1/niches/:code/prompts/:type` | Update prompt (versi naik otomatis) |
| `POST` | `/api/v1/niches/:code/prompts/:type/reset` | Reset prompt ke baseline |
| `GET` | `/api/v1/system/status` | Health check: DB + API key |
| `GET` | `/api/v1/system/stats` | Statistik posting & rasio sukses |

#### Contoh cURL

```bash
curl -X POST http://localhost:4000/api/v1/posts/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "nicheCode": "finance",
    "url": "https://market.bisnis.com/read/20261011/7/123456/ihsg-menguat",
    "dryRun": false,
    "skipPublish": false
  }'
```

---

### Mode 2 — Telegram Bot (Private Chat)

```bash
npm run bot
```

Kirim ke bot:
- **URL berita** — bot scrape otomatis
- **Teks berita** — langsung diproses

Bot membalas dengan progress real-time:
```
⏳ [1/4] Mengambil & memproses artikel...
⏳ [2/4] Menganalisis artikel & mengekstrak konsep editorial...
⏳ [3/4] Menghasilkan poster gambar AI (1080×1350)...
⏳ [4/4] Mengunggah & mempublikasikan ke Instagram via Zernio...
```

Lalu mengirim foto poster + ringkasan hasil.

**Flag modifier** — awali pesan dengan:

| Flag | Efek |
|---|---|
| `!dryrun` / `--dry-run` | Hanya ekstraksi AI, skip gambar & publish |
| `!skip` / `--skip-publish` | Generate gambar, skip publish Instagram |

**Perintah manajemen:**

| Perintah | Fungsi |
|---|---|
| `/start` / `/help` | Panduan penggunaan |
| `/status` | Health check sistem |
| `/prompts` | Daftar prompt aktif + versi |
| `/getprompt <type>` | Tampilkan isi prompt |
| `/setprompt <type> <teks>` | Update prompt (versi naik) |
| `/resetprompt <type>` | Reset ke baseline |

---

### Mode 3 — Telegram Bot di Grup

1. **Pastikan privacy mode BotFather sudah dimatikan** (lihat [§ 4.6](#46-setup-telegram-bot-grup)).
2. Tambahkan bot ke grup sebagai member.
3. Kirim URL atau teks berita langsung di grup — tanpa mention bot.

Bot membalas di grup yang sama dengan progress dan poster identik seperti private chat. Semua member grup bisa memicu pipeline.

**Membatasi grup yang diizinkan** — isi `TELEGRAM_ALLOWED_GROUPS` di `.env`:

```env
# Gunakan Group ID (negatif, diawali -100) atau @username grup
TELEGRAM_ALLOWED_GROUPS=-1001234567890,@tim_konten
```

Mendapatkan Group ID:
```
https://api.telegram.org/bot<TOKEN>/getUpdates
# Cari: "chat": {"id": -1001234567890, "type": "supergroup"}
```

---

### Mode 4 — CLI Auto

```bash
npm run auto
# atau langsung:
node scripts/auto.js
```

Mode non-interaktif via argumen:

```bash
# Dari URL
node scripts/auto.js --url="https://market.bisnis.com/read/..."

# Dari teks
node scripts/auto.js --text="IHSG ditutup menguat 1.2% ke level 7.800..."

# Dry run (ekstraksi saja)
node scripts/auto.js --url="https://..." --dry-run

# Generate gambar, skip publish
node scripts/auto.js --url="https://..." --skip-publish

# Niche eksplisit
node scripts/auto.js --url="https://..." --niche=finance
```

---

## 7. Referensi Variabel Lingkungan

| Kategori | Variabel | Wajib | Default | Deskripsi |
|---|---|---|---|---|
| **Telegram** | `TELEGRAM_BOT_TOKEN` | ✅ | — | Token dari @BotFather |
| | `TELEGRAM_ALLOWED_USERS` | — | _(semua)_ | Username/ID dipisah koma; kosong = izinkan semua |
| | `TELEGRAM_ALLOWED_GROUPS` | — | _(semua)_ | Group ID/@username dipisah koma; kosong = izinkan semua grup |
| | `ACTIVE_NICHE` | — | `finance` | Kode niche default untuk bot & CLI |
| **OpenAI** | `OPENAI_API_KEY` | ✅ | — | API Key OpenAI |
| | `TEXT_MODEL` | — | `gpt-4o` | Model ekstraksi teks |
| | `OPENAI_MODEL` | — | `gpt-4o` | Alias model utama |
| | `VISION_MODEL` | — | `gpt-4o` | Model vision |
| | `IMAGE_MODEL` | — | `gpt-image-2.5-sunburst` | Model gambar fallback OpenAI |
| | `IMAGE_QUALITY` | — | `standard` | `standard` / `hd` |
| | `IMAGE_SIZE` | — | `1088x1360` | Resolusi awal sebelum Sharp normalisasi |
| **Local Image** | `LOCAL_IMAGE_API_URL` | — | `http://localhost:20128/...` | Endpoint Gemini lokal (utama) |
| | `LOCAL_IMAGE_API_KEY` | — | — | Key endpoint gambar lokal |
| | `LOCAL_IMAGE_MODEL` | — | `ag/gemini-3.1-flash-image` | Model gambar lokal |
| **Zernio** | `ZERNIO_API_KEY` | ✅ | — | Key Zernio untuk publish Instagram |
| | `ZERNIO_INSTAGRAM_ACCOUNT_ID` | — | _(auto-detect)_ | ID akun Instagram; auto-fetch jika kosong |
| **Database** | `DB_DIALECT` | — | `sqlite` | `sqlite` / `postgres` / `mysql` |
| | `DB_STORAGE` | — | `./data/assistance.sqlite` | Path file SQLite |
| | `DB_HOST` | — | `127.0.0.1` | Host DB (Postgres/MySQL) |
| | `DB_PORT` | — | `5432` | Port DB |
| | `DB_NAME` | — | `assistance_schedule` | Nama DB |
| | `DB_USER` | — | `postgres` | User DB |
| | `DB_PASSWORD` | — | — | Password DB |
| | `DB_LOGGING` | — | `false` | `true` = cetak query SQL ke konsol |
| **Scraper** | `PLAYWRIGHT_HEADLESS` | — | `true` | `false` membuka window browser |
| | `SCRAPE_MAX_RETRIES` | — | `2` | Retry scraping saat gagal |
| | `DEBUG_SCRAPER` | — | `false` | Log verbose DOM scraper |
| **Server** | `PORT` | — | `4000` | Port HTTP Express |
| | `CORS_ORIGIN` | — | `*` | CORS origin |

---

## 8. Manajemen Prompt & Versioning

Tiga tipe prompt per niche, tersimpan di tabel `Prompts` (bukan hardcode di kode):

| Tipe | Fungsi |
|---|---|
| `entity_extraction` | Instruksi GPT-4o: ekstrak kategori, headline, emiten IDX, tokoh, caption |
| `visual_image` | Instruksi generator gambar: komposisi, warna, tipografi poster editorial |
| `caption_template` | Template caption Instagram dengan placeholder `{{hook}}`, `{{summary}}`, `{{cta}}`, `{{hashtags}}`, dll. |

Setiap update via API `PUT /api/v1/niches/:code/prompts/:type` atau Telegram `/setprompt` otomatis menaikkan `version`. Reset via API atau `/resetprompt` mengembalikan ke baseline seeder.

---

## 9. Project Knowledge

Bagian ini mendokumentasikan keputusan arsitektur, kontrak antar-service, dan invarian sistem yang perlu dipahami sebelum memodifikasi kode.

### 9.1 Model Data

```
Niche (1) ──< Prompt (N)      — prompt terisolasi per niche
Niche (1) ──< BotConfig (N)   — konfigurasi bot per niche (reserved)
Niche (1) ──< PostLog (N)     — riwayat eksekusi pipeline
```

**Tabel `Niches`**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `code` | STRING(50), unique | Identifier niche, dipakai di semua query (`finance`) |
| `name` | STRING(100) | Nama display |
| `isActive` | BOOLEAN | Niche inactive tidak bisa dipakai pipeline |

**Tabel `Prompts`**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `nicheId` | FK → Niches | Niche pemilik |
| `type` | STRING | `entity_extraction` / `visual_image` / `caption_template` |
| `version` | INTEGER | Naik +1 tiap update; tidak ada rollback parsial |
| `systemPrompt` | TEXT | Isi prompt aktual |
| `isActive` | BOOLEAN | Hanya satu prompt aktif per `(nicheId, type)` |

**Tabel `PostLogs`** — lifecycle status:

```
pending → extracting → generating_image → publishing → published
                                        ↘ generated  (skipPublish)
                     ↘ pending           (dryRun)
* → failed           (error di langkah manapun)
```

| Status | Artinya |
|---|---|
| `pending` | Baru dibuat / selesai dry-run |
| `extracting` | Sedang scrape + AI extract |
| `generating_image` | Sedang generate poster |
| `publishing` | Sedang upload + publish Zernio |
| `published` | Selesai dan live di Instagram |
| `generated` | Poster selesai, publish dilewati (`skipPublish`) |
| `failed` | Error; kolom `error` berisi pesan |

### 9.2 Service Contracts

**`pipelineService.runPipeline(params)`**

```js
params = {
  nicheCode: string,          // default 'finance'
  input: string | { url?, text? },
  triggeredBy: string,        // '@username' atau 'cli'
  dryRun: boolean,            // default false
  skipPublish: boolean,       // default false
  onProgress: (step, total, message) => void,  // optional
}
// Returns: { logId, nicheCode, article, extracted, visualPrompt,
//            imagePath, caption, published, publishResult, status }
```

`onProgress` dipanggil 4 kali (step 1–4). Telegram Bot menggunakannya untuk edit pesan status secara real-time via `ctx.telegram.editMessageText`.

**`promptService.getActivePrompt(nicheCode, type)`**

Melempar `Error` jika prompt tidak ditemukan — pipeline akan catch dan update status ke `failed`.

**`authMiddleware(ctx, next)`** — logika akses:

| Chat type | Kondisi | Aksi |
|---|---|---|
| `channel` | — | Diabaikan (return tanpa `next()`) |
| `group` / `supergroup` | `TELEGRAM_ALLOWED_GROUPS` kosong | `next()` |
| `group` / `supergroup` | ID/username tidak di list | Reply `⛔ Grup ini tidak diizinkan…` |
| `private` | `TELEGRAM_ALLOWED_USERS` kosong | `next()` |
| `private` | ID/username tidak di list | Reply `⛔ Akses ditolak…` |

Member grup **tidak** dicek terhadap `TELEGRAM_ALLOWED_USERS`. Akses grup dikontrol di level chat, bukan per-user.

### 9.3 Image Generator — Strategi Fallback

```
1. Coba LOCAL_IMAGE_API_URL (Gemini endpoint)
2. Jika gagal / tidak dikonfigurasi → OpenAI Image API (IMAGE_MODEL)
3. Output mentah diproses Sharp → resize ke 1080×1350, format PNG
4. Disimpan ke ./output/<timestamp>.png
5. Disajikan statis via /media/<filename>
```

### 9.4 Zernio Publisher Flow

```
1. getInstagramAccount()     → ambil account ID (cache / ZERNIO_INSTAGRAM_ACCOUNT_ID)
2. getPresignedUploadUrl()   → S3 presigned URL
3. uploadImageToS3()         → PUT gambar ke S3
4. publishPost()             → trigger Zernio publish ke Instagram
5. Return { postId, platformPostUrl, status, success }
```

### 9.5 Konvensi Kode

- Semua service adalah pure functions / stateless (kecuali DB call).
- Error propagasi ke atas — tidak di-suppress di service layer; ditangani di controller / handler.
- `triggeredBy` diisi `@username` (bot) atau `'cli'`; dipakai untuk audit log di `PostLogs.triggeredBy`.
- Prompt diambil fresh dari DB tiap pipeline run — perubahan prompt berlaku untuk pipeline berikutnya tanpa restart.
- `ACTIVE_NICHE` env var adalah default; REST API dan CLI bisa override per-request via `nicheCode` param.

### 9.6 Menambah Niche Baru

1. Insert ke tabel `Niches` via migration atau langsung.
2. Insert minimal 3 prompt (`entity_extraction`, `visual_image`, `caption_template`) ke tabel `Prompts` dengan `nicheId` yang benar dan `isActive: true`.
3. Set `ACTIVE_NICHE=<code_baru>` di `.env` atau sertakan `nicheCode` di setiap request API/CLI.

---

## 10. Troubleshooting & FAQ

### `Executable doesn't exist at .../playwright/chromium...`
Playwright binary belum diunduh.
```bash
npx playwright install chromium
# Linux server:
npx playwright install --with-deps chromium
```

### `SQLITE_CANTOPEN: unable to open database file`
Folder `data/` belum ada atau tidak ada izin tulis.
```bash
mkdir -p data && chmod 755 data
```

### `ZERNIO_API_KEY is not configured`
Isi `ZERNIO_API_KEY` di `.env`. Untuk testing tanpa publish, gunakan `!skip` di bot atau `--skip-publish` di CLI.

### Akun Instagram tidak ditemukan di Zernio
Hubungkan akun Instagram Business/Creator di dashboard Zernio. Jika multi-akun, set manual:
```env
ZERNIO_INSTAGRAM_ACCOUNT_ID=acc_xxxxxxxxxxxx
```

### Bot Telegram tidak merespons pesan biasa di grup
Privacy mode masih aktif. Matikan via BotFather: `/setprivacy → Disable` lalu restart bot.

### `⛔ Grup ini tidak diizinkan menggunakan bot ini.`
Group ID/username grup tidak ada di `TELEGRAM_ALLOWED_GROUPS`. Tambahkan atau kosongkan variabel untuk izinkan semua grup.

### `⛔ Akses ditolak` di private chat
Username/ID tidak ada di `TELEGRAM_ALLOWED_USERS`. Tambahkan atau kosongkan variabel.

### Endpoint gambar lokal tidak bisa dihubungi
Service lokal di `LOCAL_IMAGE_API_URL` mati. Pipeline otomatis fallback ke OpenAI Image API menggunakan `OPENAI_API_KEY`.

---

## Lisensi

Proyek ini dirilis di bawah lisensi [ISC License](LICENSE).
