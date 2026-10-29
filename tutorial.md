# Tutorial: Assistance Schedule Bot

Bot Telegram untuk otomatisasi posting berita pasar modal & finansial ke Instagram. Pipeline: scrape artikel → ekstraksi AI → generate poster → publish via Zernio.

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Instalasi & Konfigurasi](#2-instalasi--konfigurasi)
3. [Menjalankan Bot](#3-menjalankan-bot)
4. [Cara Pakai — Private Chat](#4-cara-pakai--private-chat)
5. [Cara Pakai — Grup Telegram](#5-cara-pakai--grup-telegram)
6. [Mode Khusus](#6-mode-khusus)
7. [Manajemen Prompt AI](#7-manajemen-prompt-ai)
8. [Kontrol Akses](#8-kontrol-akses)
9. [Referensi Variabel Lingkungan](#9-referensi-variabel-lingkungan)

---

## 1. Prasyarat

- Node.js ≥ 18
- Token bot Telegram (dari [@BotFather](https://t.me/BotFather))
- OpenAI API key
- Zernio API key (untuk publish ke Instagram)

---

## 2. Instalasi & Konfigurasi

```bash
npm install
cp .env.example .env
```

Isi `.env` sesuai kebutuhan — lihat [Referensi Variabel Lingkungan](#9-referensi-variabel-lingkungan).

Inisialisasi database:

```bash
npm run migrate
# atau
node src/cli/seed.js
```

---

## 3. Menjalankan Bot

```bash
npm start
```

Cek koneksi dan konfigurasi dari Telegram dengan mengirim `/status`.

---

## 4. Cara Pakai — Private Chat

1. Buka chat private dengan bot.
2. Kirim salah satu:
   - **URL berita** — bot akan scrape dan memproses otomatis.
     ```
     https://market.bisnis.com/read/...
     ```
   - **Teks berita** — tempel teks artikel langsung.

Bot akan membalas dengan progress update bertahap:

```
⏳ [1/4] Mengambil & memproses artikel...
⏳ [2/4] Mengekstraksi entitas & headline...
⏳ [3/4] Membuat poster...
⏳ [4/4] Mempublikasikan ke Instagram...
```

Setelah selesai, bot mengirim gambar poster beserta ringkasan:

```
✅ Berhasil Dipublikasikan ke Instagram!
📌 Post ID: <id>
🔗 URL: https://...
📰 Headline: ...
🏷️ Kategori: #IDX MARKET WATCH
💾 Database Log ID: #42
```

---

## 5. Cara Pakai — Grup Telegram

### Setup Awal (satu kali)

**Wajib:** Matikan privacy mode bot di BotFather agar bot bisa membaca pesan biasa di grup.

```
1. Buka chat dengan @BotFather
2. Kirim /setprivacy
3. Pilih bot Anda
4. Pilih Disable
```

> Tanpa langkah ini, bot hanya menerima `/command` di grup, bukan teks biasa.

### Menambahkan Bot ke Grup

1. Buka grup Telegram.
2. Tambahkan bot sebagai member (Add Member → cari username bot).
3. Pastikan bot memiliki izin membaca pesan.

### Mengirim Berita di Grup

Kirim URL atau teks berita langsung di grup — tidak perlu mention bot.

```
https://market.bisnis.com/read/...
```

Bot membalas di grup yang sama dengan progress dan hasil yang identik dengan private chat.

### Mendapatkan Group ID

Group ID diperlukan jika ingin membatasi akses (lihat [§ Kontrol Akses](#8-kontrol-akses)).

```
# Cara 1 — via API Telegram (ganti <TOKEN>)
https://api.telegram.org/bot<TOKEN>/getUpdates

# Cari di response JSON:
# "chat": {"id": -1001234567890, "type": "supergroup"}
```

Group ID selalu negatif dan diawali `-100` untuk supergroup.

---

## 6. Mode Khusus

Awali pesan dengan flag berikut untuk mengubah perilaku pipeline.

| Flag | Alias | Efek |
|---|---|---|
| `!dryrun` | `--dry-run` | Ekstraksi AI saja; skip generate gambar & publish |
| `!skip` | `--skip-publish` | Ekstraksi + generate gambar; skip publish ke Instagram |

**Contoh:**

```
!dryrun https://market.bisnis.com/read/...
```

```
!skip Saham BBCA naik 3% didorong sentimen positif...
```

Ini berlaku baik di private chat maupun di grup.

---

## 7. Manajemen Prompt AI

Pipeline menggunakan tiga tipe prompt yang tersimpan di database dan bisa diubah tanpa restart.

| Tipe | Fungsi |
|---|---|
| `entity_extraction` | Ekstraksi entitas, headline, kategori dari artikel |
| `visual_image` | Instruksi generate poster |
| `caption_template` | Template caption Instagram |

### Perintah

**`/status`** — Cek koneksi database, konfigurasi API, jumlah prompt aktif.

**`/prompts`** — Daftar semua prompt aktif beserta versinya.

**`/getprompt <type>`** — Tampilkan isi system prompt.

```
/getprompt entity_extraction
```

**`/setprompt <type> <teks>`** — Perbarui system prompt (versi naik otomatis).

```
/setprompt caption_template {{hook}}

{{summary}}

{{hashtags}}
```

**`/resetprompt <type>`** — Kembalikan prompt ke baseline default.

```
/resetprompt caption_template
```

> `/setprompt` dan `/resetprompt` hanya efektif dari private chat pengguna yang terdaftar.

---

## 8. Kontrol Akses

### Private Chat

Atur `TELEGRAM_ALLOWED_USERS` di `.env`. Kosongkan untuk mengizinkan semua orang.

```env
# Izinkan berdasarkan username (tanpa @) atau numeric user ID, pisah koma
TELEGRAM_ALLOWED_USERS=johndoe,87654321
```

### Grup

Atur `TELEGRAM_ALLOWED_GROUPS` di `.env`. Kosongkan untuk mengizinkan semua grup.

```env
# Izinkan berdasarkan group ID atau @username grup, pisah koma
TELEGRAM_ALLOWED_GROUPS=-1001234567890,-1009876543210
# Atau pakai username:
TELEGRAM_ALLOWED_GROUPS=@redaksi_pasar,@tim_konten
# Atau campuran:
TELEGRAM_ALLOWED_GROUPS=-1001234567890,@tim_konten
```

Jika grup tidak terdaftar, bot membalas: `⛔ Grup ini tidak diizinkan menggunakan bot ini.`

### Matriks Akses

| Situasi | `ALLOWED_USERS` | `ALLOWED_GROUPS` | Hasil |
|---|---|---|---|
| Private chat | kosong | — | ✅ Semua user diizinkan |
| Private chat | diisi | — | ✅ Hanya user terdaftar |
| Grup | — | kosong | ✅ Semua grup diizinkan |
| Grup | — | diisi | ✅ Hanya grup terdaftar |
| Channel | — | — | ⛔ Selalu diabaikan |

Member grup tidak perlu terdaftar di `TELEGRAM_ALLOWED_USERS` — akses grup dikontrol di level grup, bukan per-user.

---

## 9. Referensi Variabel Lingkungan

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token dari @BotFather |
| `TELEGRAM_ALLOWED_USERS` | — | _(semua)_ | User ID/username yang diizinkan di private chat |
| `TELEGRAM_ALLOWED_GROUPS` | — | _(semua)_ | Group ID/@username yang diizinkan |
| `ACTIVE_NICHE` | — | `finance` | Kode niche aktif untuk pemilihan prompt |
| `OPENAI_API_KEY` | ✅ | — | Key OpenAI untuk ekstraksi & generate gambar |
| `TEXT_MODEL` | — | `gpt-4o` | Model untuk ekstraksi teks |
| `OPENAI_MODEL` | — | `gpt-4o` | Model utama OpenAI |
| `IMAGE_MODEL` | — | `gpt-image-2.5-sunburst` | Model generate gambar |
| `VISION_MODEL` | — | `gpt-4o` | Model vision (analisis gambar) |
| `IMAGE_QUALITY` | — | `standard` | Kualitas gambar: `standard` / `hd` |
| `IMAGE_SIZE` | — | `1088x1360` | Resolusi poster |
| `ZERNIO_API_KEY` | ✅ | — | Key Zernio untuk publish Instagram |
| `ZERNIO_INSTAGRAM_ACCOUNT_ID` | — | _(auto)_ | ID akun Instagram; auto-fetch jika kosong |
| `PLAYWRIGHT_HEADLESS` | — | `true` | Mode headless scraper |
| `SCRAPE_MAX_RETRIES` | — | `2` | Jumlah retry scraping |
| `DEBUG_SCRAPER` | — | `false` | Log verbose scraper |
| `DB_DIALECT` | — | `sqlite` | Dialect database: `sqlite` / `postgres` / `mysql` |
| `DB_STORAGE` | — | `./data/assistance.sqlite` | Path file SQLite |
| `PORT` | — | `4000` | Port server HTTP |
