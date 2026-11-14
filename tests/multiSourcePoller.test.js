const test = require('node:test');
const assert = require('node:assert/strict');

const multiSourcePoller = require('../src/newsEngine/poller/MultiSourcePoller');
const { ProcessingQueue } = require('../src/newsEngine/queue/ProcessingQueue');

test('MultiSourcePoller has default Indonesian financial feeds and honors NEWS_FEED_URLS', () => {
  assert.equal(multiSourcePoller.DEFAULT_FEEDS.length, 4);
  assert.ok(multiSourcePoller.DEFAULT_FEEDS.some((f) => f.includes('cnbcindonesia.com')));
  assert.ok(multiSourcePoller.DEFAULT_FEEDS.some((f) => f.includes('kontan.co.id')));
  assert.ok(multiSourcePoller.DEFAULT_FEEDS.some((f) => f.includes('antaranews.com')));
  assert.ok(multiSourcePoller.DEFAULT_FEEDS.some((f) => f.includes('tempo.co')));

  const origEnv = process.env.NEWS_FEED_URLS;
  process.env.NEWS_FEED_URLS = 'https://custom.com/rss1, https://custom.com/rss2';
  const poller = new multiSourcePoller.MultiSourcePoller();
  assert.deepEqual(poller.getFeedUrls(), ['https://custom.com/rss1', 'https://custom.com/rss2']);

  if (origEnv !== undefined) {
    process.env.NEWS_FEED_URLS = origEnv;
  } else {
    delete process.env.NEWS_FEED_URLS;
  }
});

test('MultiSourcePoller.normalizeArticleUrl strips tracking parameters and trailing slashes', () => {
  const dirtyUrl = 'https://www.cnbcindonesia.com/market/20250102/ihsg-menguat/?utm_source=rss&utm_medium=feed&ref=home#section1';
  const clean = multiSourcePoller.normalizeArticleUrl(dirtyUrl);
  assert.equal(clean, 'https://www.cnbcindonesia.com/market/20250102/ihsg-menguat');
});

test('fetchFeedArticles parses RSS XML fixtures and handles feed failures gracefully', async () => {
  const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>CNBC Indonesia Market</title>
        <item>
          <title><![CDATA[Laba Bersih BBCA Tembus Rekor Baru di Kuartal IV]]></title>
          <link>https://www.cnbcindonesia.com/market/20250102/bbca-laba-rekor?utm_source=rss</link>
          <pubDate>Thu, 02 Jan 2025 08:00:00 GMT</pubDate>
          <description><![CDATA[PT Bank Central Asia Tbk mencatatkan pertumbuhan laba impresif.]]></description>
        </item>
      </channel>
    </rss>
  `;

  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('fail-feed.com')) {
      throw new Error('Connection refused');
    }
    return {
      ok: true,
      status: 200,
      text: async () => mockXml,
    };
  };

  try {
    const poller = new multiSourcePoller.MultiSourcePoller({
      feedUrls: ['https://www.cnbcindonesia.com/market/rss', 'https://fail-feed.com/rss'],
    });

    const articles = await poller.fetchFeedArticles();

    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Laba Bersih BBCA Tembus Rekor Baru di Kuartal IV');
    assert.equal(articles[0].url, 'https://www.cnbcindonesia.com/market/20250102/bbca-laba-rekor');
    assert.equal(articles[0].sourceName, 'CNBC Indonesia');
  } finally {
    global.fetch = origFetch;
  }
});

test('getTopRankedArticles sorts by priority score and applies cluster-aware deduplication', async () => {
  const customQueue = new ProcessingQueue({ concurrency: 2 });
  const poller = new multiSourcePoller.MultiSourcePoller({ queue: customQueue });

  // Article A: Kontan covering BBCA dividend, priority_score 0.75
  const jobA = {
    jobId: 'job_test_1',
    url: 'https://insight.kontan.co.id/news/bbca-tebar-dividen',
    status: 'completed',
    result: {
      isDuplicate: false,
      article: {
        canonical_url: 'https://insight.kontan.co.id/news/bbca-tebar-dividen',
        original_url: 'https://insight.kontan.co.id/news/bbca-tebar-dividen',
        title: 'BBCA Tebar Dividen Tunai Jumbo',
        description: 'BCA siap membagikan dividen tunai tahun buku 2024.',
        article_content: 'PT Bank Central Asia Tbk akan menyalurkan dividen tunai kepada seluruh pemegang saham.',
        source_name: 'Kontan',
        stock_tickers: ['BBCA'],
        published_at: '2025-01-02T08:00:00Z',
      },
      analysis: {
        executive_summary: ['BCA membagikan dividen tunai.'],
      },
      recommendation: {
        priority_score: 0.75,
        is_cluster_update: false,
        cluster_id: 'cluster_bbca_dividend',
        recommended_format: 'single',
      },
      cluster: {
        cluster_id: 'cluster_bbca_dividend',
        event_category: 'DIVIDEN',
      },
    },
  };

  // Article B: CNBC Indonesia covering same BBCA dividend, higher priority_score 0.88
  const jobB = {
    jobId: 'job_test_2',
    url: 'https://www.cnbcindonesia.com/market/20250102/bca-umumkan-dividen-rekor',
    status: 'completed',
    result: {
      isDuplicate: false,
      article: {
        canonical_url: 'https://www.cnbcindonesia.com/market/20250102/bca-umumkan-dividen-rekor',
        original_url: 'https://www.cnbcindonesia.com/market/20250102/bca-umumkan-dividen-rekor',
        title: 'BCA Umumkan Dividen Tunai Rekor Tertinggi',
        description: 'Manajemen BBCA menyetujui pembagian dividen final.',
        article_content: 'BCA mengumumkan dividen tunai rekor tertinggi sepanjang sejarah perbankan Indonesia.',
        source_name: 'CNBC Indonesia',
        stock_tickers: ['BBCA'],
        published_at: '2025-01-02T08:30:00Z',
      },
      analysis: {
        executive_summary: ['Manajemen BCA menyetujui dividen final rekor.'],
      },
      recommendation: {
        priority_score: 0.88,
        is_cluster_update: false,
        cluster_id: 'cluster_bbca_dividend', // SAME CLUSTER
        recommended_format: 'carousel',
      },
      cluster: {
        cluster_id: 'cluster_bbca_dividend',
        event_category: 'DIVIDEN',
      },
    },
  };

  // Article C: Antara covering macro inflation, different cluster, priority_score 0.70
  const jobC = {
    jobId: 'job_test_3',
    url: 'https://www.antaranews.com/berita/inflasi-terkendali',
    status: 'completed',
    result: {
      isDuplicate: false,
      article: {
        canonical_url: 'https://www.antaranews.com/berita/inflasi-terkendali',
        original_url: 'https://www.antaranews.com/berita/inflasi-terkendali',
        title: 'BPS Catat Inflasi Tahunan Terkendali di Bawah Target',
        description: 'BPS merilis data inflasi tahunan.',
        article_content: 'Badan Pusat Statistik mengumumkan tingkat inflasi domestik masih terjaga stabil.',
        source_name: 'Antara',
        stock_tickers: [],
        published_at: '2025-01-02T09:00:00Z',
      },
      analysis: {
        executive_summary: ['BPS umumkan inflasi terkendali.'],
      },
      recommendation: {
        priority_score: 0.70,
        is_cluster_update: false,
        cluster_id: 'cluster_macro_inflation',
        recommended_format: 'single',
      },
      cluster: {
        cluster_id: 'cluster_macro_inflation',
        event_category: 'MAKRO',
      },
    },
  };

  customQueue.jobsMap.set(jobA.jobId, jobA);
  customQueue.jobsMap.set(jobB.jobId, jobB);
  customQueue.jobsMap.set(jobC.jobId, jobC);

  const ranked = await poller.getTopRankedArticles({ limit: 5 });

  // Should have 2 articles: CNBC (won BBCA cluster with 0.88) and Antara (0.70)
  // Kontan (0.75) must be deduplicated because it is in the same cluster as CNBC (0.88)
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].sourceName, 'CNBC Indonesia');
  assert.equal(ranked[0].priorityScore, 0.88);
  assert.equal(ranked[0].clusterId, 'cluster_bbca_dividend');
  assert.equal(ranked[0].eventCategory, 'DIVIDEN');
  assert.deepEqual(ranked[0].stockTickers, ['BBCA']);

  assert.equal(ranked[1].sourceName, 'Antara');
  assert.equal(ranked[1].priorityScore, 0.70);
  assert.equal(ranked[1].clusterId, 'cluster_macro_inflation');

  // Test excludeUrls: excluding both BBCA articles leaves only Antara
  const filtered = await poller.getTopRankedArticles({
    excludeUrls: new Set([ranked[0].url, jobA.url]),
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].sourceName, 'Antara');
});

test('syncFeedsToQueue ingests new feed items into queue and processes them', async () => {
  const customQueue = new ProcessingQueue({ concurrency: 2 });
  const poller = new multiSourcePoller.MultiSourcePoller({ queue: customQueue });

  const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Kontan News</title>
        <item>
          <title><![CDATA[BBRI Bagikan Dividen Interim Rp 135 Per Saham]]></title>
          <link>https://insight.kontan.co.id/news/bbri-bagikan-dividen-interim</link>
          <pubDate>Thu, 02 Jan 2025 10:00:00 GMT</pubDate>
          <description><![CDATA[PT Bank Rakyat Indonesia Tbk membagikan dividen interim senilai Rp 135 per saham.]]></description>
        </item>
      </channel>
    </rss>
  `;

  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/rss')) {
      return {
        ok: true,
        status: 200,
        text: async () => feedXml,
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => '<html><head><title>BBRI Bagikan Dividen Interim Rp 135 Per Saham - KONTAN</title></head><body><div class="content"><p>PT Bank Rakyat Indonesia Tbk membagikan dividen interim senilai Rp 135 per saham.</p></div></body></html>',
    };
  };
  try {
    const result = await poller.syncFeedsToQueue(['https://insight.kontan.co.id/rss']);
    assert.equal(result.discovered, 1);
    assert.equal(result.enqueued, 1);

    const ranked = await poller.getTopRankedArticles({ limit: 1 });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].sourceName, 'Kontan');
    assert.match(ranked[0].title, /BBRI Bagikan Dividen Interim/);
    assert.ok(ranked[0].priorityScore > 0);
  } finally {
    global.fetch = origFetch;
  }
});
