const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');

const UniversalArticleSchema = require('../src/newsEngine/schema/UniversalArticleSchema');
const sourceAdapterRegistry = require('../src/newsEngine/registry/SourceAdapterRegistry');
const sourceReliabilityRegistry = require('../src/newsEngine/registry/SourceReliabilityRegistry');
const deduplicator = require('../src/newsEngine/clustering/Deduplicator');
const eventClusterer = require('../src/newsEngine/clustering/EventClusterer');
const EntityExtractor = require('../src/newsEngine/entity/EntityExtractor');

// 1. Kontan Article Test
test('Scenario 1: Kontan article parsing cleans title, removes pagination, and extracts reporter credit', async () => {
  const kontanHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Kinerja Emiten Tambang Emas Moncer di Awal Tahun - KONTAN</title>
        <meta name="description" content="Kinerja keuangan emiten tambang emas melaju kencang didorong kenaikan harga komoditas global.">
      </head>
      <body>
        <div class="content">
          <p>KONTAN.CO.ID - JAKARTA. Kinerja keuangan emiten tambang emas melaju kencang didorong kenaikan harga komoditas global di pasar internasional.</p>
          <p>Reporter: Ridwan Nanda Mulyana | Editor: Noverius Laoli</p>
          <p>Sejumlah analis memperkirakan tren positif ini akan berlanjut sepanjang kuartal pertama tahun ini.</p>
          <p>Halaman 1 2 3</p>
        </div>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://insight.kontan.co.id/news/kinerja-emiten-tambang-emas-moncer',
    html: kontanHtml,
  });

  assert.equal(article.source_name, 'Kontan');
  assert.equal(article.source_type, 'financial_media');
  assert.equal(article.title, 'Kinerja Emiten Tambang Emas Moncer di Awal Tahun');
  assert.match(article.author, /Ridwan Nanda Mulyana/);
  assert.match(article.author, /Noverius Laoli/);
  assert.doesNotMatch(article.article_content, /KONTAN\.CO\.ID - JAKARTA/);
  assert.doesNotMatch(article.article_content, /Halaman 1 2 3/);
  assert.ok(article.article_content.length > 50);
});

// 2. CNBC Indonesia Article Test
test('Scenario 2: CNBC Indonesia parsing extracts subheadline, detail text, and identifies ticker', async () => {
  const cnbcHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Laba Bersih BREN Melompat 25 Persen Sepanjang Tahun Lalu - CNBC Indonesia</title>
      </head>
      <body>
        <h2 class="sub_judul">Dukung Ekspansi Transisi Energi Panas Bumi</h2>
        <div class="detail_text">
          <p>Jakarta, CNBC Indonesia -- PT Barito Renewables Energy Tbk mencatatkan lonjakan laba bersih solid sebesar 25 persen sepanjang tahun lalu.</p>
          <p>Peningkatan laba tersebut ditopang oleh efisiensi operasional dan optimalisasi aset pembangkit listrik geothermal.</p>
          <p>Halaman 1 2</p>
        </div>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://www.cnbcindonesia.com/market/20250101-bren-laba-melompat',
    html: cnbcHtml,
  });

  assert.equal(article.source_name, 'CNBC Indonesia');
  assert.equal(article.source_type, 'financial_media');
  assert.equal(article.title, 'Laba Bersih BREN Melompat 25 Persen Sepanjang Tahun Lalu');
  assert.equal(article.subtitle, 'Dukung Ekspansi Transisi Energi Panas Bumi');
  assert.doesNotMatch(article.article_content, /Jakarta, CNBC Indonesia --/i);
  assert.doesNotMatch(article.article_content, /Halaman 1 2/i);

  // Entity extraction on article
  const extractor = new EntityExtractor();
  const entities = extractor.extractEntities(article.article_content, article.title);
  assert.ok(entities.stock_tickers.includes('BREN'));
  assert.ok(entities.sectors.includes('Energi'));
});

// 3. Bisnis Indonesia Article Test
test('Scenario 3: Bisnis.com parsing extracts author byline, image, and clean text', async () => {
  const bisnisHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Bank Mandiri (BMRI) Pacu Pertumbuhan Kredit Berkelanjutan | Bisnis.com</title>
        <meta property="og:image" content="https://img.bisnis.com/posts/bmri-kredit.jpg">
        <link rel="canonical" href="https://market.bisnis.com/read/20250101/189/bmri-kredit-berkelanjutan">
      </head>
      <body>
        <span class="author-name">Annisa Kurniasari Saumi</span>
        <div class="article-content">
          <p>Bisnis.com, JAKARTA — PT Bank Mandiri (Persero) Tbk terus mempercepat penyaluran portofolio pembiayaan berkelanjutan secara masif.</p>
          <p>Direktur Utama Darmawan Junaidi menegaskan komitmen perseroan dalam mendukung target net zero emission nasional.</p>
        </div>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://market.bisnis.com/read/20250101/189/bmri-kredit-berkelanjutan?utm_source=twitter',
    html: bisnisHtml,
  });

  assert.equal(article.source_name, 'Bisnis.com');
  assert.equal(article.source_type, 'financial_media');
  assert.equal(article.author, 'Annisa Kurniasari Saumi');
  assert.equal(article.canonical_url, 'https://market.bisnis.com/read/20250101/189/bmri-kredit-berkelanjutan');
  assert.equal(article.images[0]?.url, 'https://img.bisnis.com/posts/bmri-kredit.jpg');
  assert.doesNotMatch(article.article_content, /Bisnis\.com, JAKARTA —/i);

  const extractor = new EntityExtractor();
  const entities = extractor.extractEntities(article.article_content, article.title);
  assert.ok(entities.stock_tickers.includes('BMRI'));
  assert.ok(entities.people.some((p) => p.name === 'Darmawan Junaidi'));
});

// 4. Official IDX Announcement Test
test('Scenario 4: Official IDX announcement extracts stock ticker, submission ID, and OFFICIAL_PRIMARY tier', async () => {
  const idxHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Pengumuman Keterbukaan Informasi - PT Bursa Efek Indonesia</title>
      </head>
      <body>
        <h1>Penyampaian Bukti Iklan Informasi Pembagian Dividen Tunai [BBCA]</h1>
        <p>No. Registrasi: PENG-DIV-0099/BEI.PP1/01-2025</p>
        <p>Kode Emiten: BBCA</p>
        <p>Tanggal Pengumuman: 05-Jan-2025 10:30:00</p>
        <p>PT Bank Central Asia Tbk menyampaikan bukti iklan pengumuman pembagian dividen tunai interim tahun buku 2024.</p>
        <a href="https://idx.co.id/announcements/attachments/dividen_bbca.pdf">Unduh Lampiran PDF</a>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://www.idx.co.id/id/berita/pengumuman/peng-div-0099',
    html: idxHtml,
  });

  assert.equal(article.source_name, 'Bursa Efek Indonesia (IDX)');
  assert.equal(article.source_type, 'official_exchange');
  assert.ok(article.stock_tickers.includes('BBCA'));
  assert.match(article.subtitle, /PENG-DIV-0099/);
  assert.match(article.description, /dividen_bbca\.pdf/);

  const reliability = sourceReliabilityRegistry.getReliability(article.original_url);
  assert.equal(reliability.tier, 'OFFICIAL_PRIMARY');
  assert.equal(reliability.trustScore, 1.0);
  assert.equal(reliability.requiresPrimaryVerification, false);
});

// 5. Unknown News Domain Test
test('Scenario 5: Unknown domain extracts dynamic hostname and falls back to GenericHTMLAdapter with UNVERIFIED tier', async () => {
  const unknownHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Analisis Pasar Modal Masa Depan</title>
        <meta property="og:description" content="Ulasan mendalam arah pergerakan pasar saham regional.">
      </head>
      <body>
        <main>
          <p>Pasar modal di kawasan Asia Tenggara menghadapi dinamika baru menyusul pergeseran aliran modal investor global.</p>
          <p>Pelaku pasar terus mengamati arah kebijakan moneter dan stabilitas nilai tukar valuta asing.</p>
        </main>
      </body>
    </html>
  `;

  const unknownUrl = 'https://independent-market-digest.org/insights/asia-markets';
  const article = await sourceAdapterRegistry.extract({
    url: unknownUrl,
    html: unknownHtml,
  });

  assert.equal(article.source_domain, 'independent-market-digest.org');
  assert.equal(article.source_type, 'generic_web');
  assert.equal(article.title, 'Analisis Pasar Modal Masa Depan');
  assert.ok(article.article_content.length > 50);

  const reliability = sourceReliabilityRegistry.getReliability(unknownUrl);
  assert.equal(reliability.tier, 'UNVERIFIED');
  assert.equal(reliability.trustScore, 0.20);
  assert.equal(reliability.requiresPrimaryVerification, true);
});

// 6. RSS Feed Article Test
test('Scenario 6: RSS feed XML ingestion parses items into UniversalArticleSchema with rss source type', async () => {
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>Berita Pasar Keuangan</title>
        <item>
          <title><![CDATA[IHSG Menguat Tipis ke Level 7.200 di Sesi Pertama]]></title>
          <link>https://tempo.co/bisnis/ihsg-menguat-tipis-sesi-pertama-12345</link>
          <dc:creator><![CDATA[Fajar Pebrianto]]></dc:creator>
          <pubDate>Thu, 02 Jan 2025 04:30:00 GMT</pubDate>
          <description><![CDATA[Indeks Harga Saham Gabungan (IHSG) bergerak di zona hijau didorong sektor perbankan.]]></description>
          <content:encoded><![CDATA[<p>Indeks Harga Saham Gabungan (IHSG) ditutup menguat tipis ke level 7.200 pada penutupan sesi pertama hari ini.</p><p>Kenaikan indeks ditopang oleh saham-saham perbankan berkapitalisasi pasar besar seperti BBCA dan BBRI.</p>]]></content:encoded>
          <enclosure url="https://img.tempo.co/ihsg.jpg" type="image/jpeg" />
        </item>
      </channel>
    </rss>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://tempo.co/feed/rss/bisnis.xml',
    xml: rssXml,
  });

  assert.equal(article.source_type, 'rss');
  assert.equal(article.extraction_method, 'rss');
  assert.equal(article.title, 'IHSG Menguat Tipis ke Level 7.200 di Sesi Pertama');
  assert.equal(article.author, 'Fajar Pebrianto');
  assert.equal(article.images[0]?.url, 'https://img.tempo.co/ihsg.jpg');
  assert.ok(article.article_content.includes('Kenaikan indeks ditopang oleh saham-saham perbankan'));
  assert.equal(article.extraction_confidence, 0.95);
});

// 7. Missing Metadata Test
test('Scenario 7: Missing metadata populates null or empty arrays without fictional data', async () => {
  const barebonesHtml = `
    <html>
      <body>
        <p>Paragraf ringkas berita ekonomi tanpa author, tanpa og image, dan tanpa tanggal terlampir di HTML.</p>
        <p>Pemerintah menargetkan pertumbuhan penerimaan negara melalui sektor pajak dan devisa ekspor.</p>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://simple-news.com/post/1',
    html: barebonesHtml,
  });

  assert.equal(article.subtitle, null);
  assert.equal(article.author, null);
  assert.equal(article.published_at, null);
  assert.deepEqual(article.images, []);
  assert.ok(Array.isArray(article.extraction_warnings));
  assert.equal(article.extraction_status, 'success');
});

// 8. JavaScript-Rendered Article Test
test('Scenario 8: Client-rendered hydration container handled without crash and routes safely', async () => {
  const jsHydrationHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Portal Berita Dinamis</title>
      </head>
      <body>
        <div id="__next"></div>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"articleId":"123"}}}</script>
      </body>
    </html>
  `;

  const article = await sourceAdapterRegistry.extract({
    url: 'https://app-news.com/article/123',
    html: jsHydrationHtml,
  }, { skipPlaywright: true, skipAiFallback: true });

  assert.ok(article instanceof UniversalArticleSchema);
  assert.ok(article.extraction_status === 'partial' || article.extraction_status === 'success');
  assert.ok(Array.isArray(article.extraction_warnings));
});

// 9. Duplicate Article Test
test('Scenario 9: Deduplicator flags identical canonical URLs and content hashes as duplicate', () => {
  const initialArticle = {
    article_id: 'art_1001',
    title: 'BBRI Catat Laba Bersih Konsolidasian Rp 60 Triliun',
    article_content: 'PT Bank Rakyat Indonesia (Persero) Tbk membukukan laba bersih konsolidasian sebesar Rp 60 triliun pada tahun buku 2024.',
    canonical_url: 'https://kontan.co.id/news/bbri-laba-bersih-60-triliun',
    stock_tickers: ['BBRI'],
  };

  const incomingDuplicate = {
    article_id: 'art_1002',
    title: 'BBRI Catat Laba Bersih Konsolidasian Rp 60 Triliun',
    article_content: 'PT Bank Rakyat Indonesia (Persero) Tbk membukukan laba bersih konsolidasian sebesar Rp 60 triliun pada tahun buku 2024.',
    canonical_url: 'https://kontan.co.id/news/bbri-laba-bersih-60-triliun?utm_source=telegram&utm_medium=channel',
    stock_tickers: ['BBRI'],
  };

  const result = deduplicator.isDuplicate(incomingDuplicate, [initialArticle]);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.duplicateOf, 'art_1001');
  assert.equal(result.matchType, 'canonical_url');
});

// 10. Updated Article / Event Clustering Test
test('Scenario 10: Corporate action update clusters under same EventCluster with is_update: true', () => {
  const articleA = {
    article_id: 'art_cluster_1',
    title: 'BBCA Rencanakan Pembagian Dividen Tunai Tahun 2025',
    article_content: 'Direksi PT Bank Central Asia Tbk mengumumkan agenda dividen tunai kepada investor pasar modal.',
    canonical_url: 'https://cnbcindonesia.com/market/rencana-dividen-bbca',
    stock_tickers: ['BBCA'],
    published_at: '2025-01-10T08:00:00Z',
    source_name: 'CNBC Indonesia',
  };

  const articleB = {
    article_id: 'art_cluster_2',
    title: 'Jadwal Lengkap Cum Date dan Ex Date Dividen BBCA',
    article_content: 'BCA menetapkan cum date dividen tunai di pasar reguler dan negosiasi pada tanggal 20 Januari 2025.',
    canonical_url: 'https://bisnis.com/read/jadwal-lengkap-dividen-bbca',
    stock_tickers: ['BBCA'],
    published_at: '2025-01-10T11:00:00Z',
    source_name: 'Bisnis.com',
  };

  const clusterRes1 = eventClusterer.clusterArticle(articleA);
  assert.equal(clusterRes1.isNewCluster, true);
  assert.equal(clusterRes1.cluster.primary_entity, 'BBCA');
  assert.equal(clusterRes1.cluster.event_category, 'DIVIDEN');

  const clusterRes2 = eventClusterer.clusterArticle(articleB);
  assert.equal(clusterRes2.isNewCluster, false);
  assert.equal(clusterRes2.isUpdate, true);
  assert.equal(clusterRes2.cluster.cluster_id, clusterRes1.cluster.cluster_id);
  assert.equal(clusterRes2.cluster.articles.length, 2);
});

// 11. Backward-Compatibility Bridge (.toLegacyArticle)
test('Scenario 11: .toLegacyArticle() seamlessly bridges UniversalArticleSchema to legacy pipeline consumer', () => {
  const schema = new UniversalArticleSchema({
    source_name: 'Kontan',
    canonical_url: 'https://kontan.co.id/news/sample',
    title: 'Headline Berita Saham',
    article_content: 'Paragraf isi berita pasar finansial lengkap.',
    images: [{ url: 'https://img.kontan.co.id/sample.jpg' }],
  });

  const legacy = schema.toLegacyArticle();
  assert.equal(legacy.source, 'Kontan');
  assert.equal(legacy.url, 'https://kontan.co.id/news/sample');
  assert.equal(legacy.title, 'Headline Berita Saham');
  assert.equal(legacy.text, 'Paragraf isi berita pasar finansial lengkap.');
  assert.equal(legacy.ogImage, 'https://img.kontan.co.id/sample.jpg');
});

// 12. Indonesian Financial Entity Reference & Ambiguity Resolution
test('Scenario 12: EntityExtractor resolves company aliases and avoids ambiguous common words', () => {
  const extractor = new EntityExtractor();
  const text = 'Presiden Joko Widodo dan Menteri BUMN Erick Thohir meninjau perluasan layanan Bank Mandiri dan Telkom. Harga emas antam stabil dan bumi indonesia subur.';
  const res = extractor.extractEntities(text, 'Kunjungan Kerja Pemerintah');

  assert.ok(res.stock_tickers.includes('BMRI')); // Bank Mandiri -> BMRI
  assert.ok(res.stock_tickers.includes('TLKM')); // Telkom -> TLKM
  assert.ok(res.stock_tickers.includes('ANTM')); // antam -> ANTM
  assert.equal(res.stock_tickers.includes('EMAS'), false); // ambiguous word excluded
  assert.equal(res.stock_tickers.includes('BUMI'), false); // ambiguous word excluded
  assert.ok(res.people.some((p) => p.name === 'Joko Widodo'));
  assert.ok(res.people.some((p) => p.name === 'Erick Thohir'));
});

// 13. REST API Endpoints Integration Test
test('Scenario 13: REST API endpoints /api/v1/news/* handle ingestion, parse, status, and sources', async () => {
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/news`;

  try {
    // GET /sources
    const sourcesRes = await fetch(`${baseUrl}/sources`);
    assert.equal(sourcesRes.status, 200);
    const sourcesData = await sourcesRes.json();
    assert.equal(sourcesData.success, true);
    assert.ok(sourcesData.sources['idx.co.id']);

    // GET /status
    const statusRes = await fetch(`${baseUrl}/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.success, true);
    assert.ok(typeof statusData.status.total === 'number');

    // POST /parse
    const parseRes = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://kontan.co.id/news/api-test-sample',
        html: '<html><head><title>Laba BNI Tumbuh Positif - KONTAN</title></head><body><div class="content"><p>PT Bank Negara Indonesia (Persero) Tbk membukukan laba solid.</p></div></body></html>',
      }),
    });
    assert.equal(parseRes.status, 200);
    const parseData = await parseRes.json();
    assert.equal(parseData.success, true);
    assert.equal(parseData.article.source_name, 'Kontan');
    assert.ok(parseData.article.stock_tickers.includes('BBNI'));
    assert.equal(parseData.legacy.source, 'Kontan');

    // POST /ingest
    const ingestRes = await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [
          'https://www.cnbcindonesia.com/market/sample-1',
          'https://market.bisnis.com/read/sample-2',
        ],
      }),
    });
    assert.equal(ingestRes.status, 202);
    const ingestData = await ingestRes.json();
    assert.equal(ingestData.success, true);
    assert.equal(ingestData.count, 2);
    const firstJobId = ingestData.jobs[0].jobId;

    // GET /jobs/:id
    const jobRes = await fetch(`${baseUrl}/jobs/${firstJobId}`);
    assert.equal(jobRes.status, 200);
    const jobData = await jobRes.json();
    assert.equal(jobData.success, true);
    assert.equal(jobData.job.jobId, firstJobId);

    // GET /clusters
    const clusterRes = await fetch(`${baseUrl}/clusters`);
    assert.equal(clusterRes.status, 200);
    const clusterData = await clusterRes.json();
    assert.equal(clusterData.success, true);
    assert.ok(Array.isArray(clusterData.data));
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});
