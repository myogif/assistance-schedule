const BaseSourceAdapter = require('./BaseSourceAdapter');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

/**
 * IDX Adapter for Bursa Efek Indonesia disclosure announcements.
 */
class IDXAdapter extends BaseSourceAdapter {
  constructor() {
    super('IDXAdapter', 'official_exchange');
  }

  matches(url = '', domain = '') {
    const d = domain || UniversalArticleSchema.extractDomain(url);
    return d.includes('idx.co.id');
  }

  async extract(input) {
    let rawHtml = '';
    let url = '';

    if (typeof input === 'string') {
      if (/^https?:\/\//i.test(input)) {
        url = input;
      } else {
        rawHtml = input;
      }
    } else if (input && typeof input === 'object') {
      url = input.url || '';
      rawHtml = input.html || input.body || '';
    }

    if (!rawHtml && url) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Accept: 'text/html,application/json',
        },
      });
      rawHtml = await res.text();
    }

    // Parse IDX announcement format
    // Extract ticker: e.g. [BBCA] or "Kode Emiten: BBCA"
    let ticker = null;
    const tickerMatch = rawHtml.match(/\[([A-Z]{4})\]|(?:kode\s+emiten|ticker|kode\s+saham)[:\s]+([A-Z]{4})/i);
    if (tickerMatch) {
      ticker = (tickerMatch[1] || tickerMatch[2]).toUpperCase();
    }

    // Submission ID
    let submissionId = null;
    const subRegex = /(?:no\.?\s*(?:registrasi|pengumuman)|nomor\s*(?:registrasi|pengumuman)|submission\s*id)[:\s]+([A-Za-z0-9\-_./]+)/i;
    const subMatch = rawHtml.match(subRegex);
    if (subMatch) {
      submissionId = subMatch[1].trim();
    }

    // Title / Subject
    let title = '';
    const titleMatch = rawHtml.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
      || rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      || rawHtml.match(/(?:perihal|judul)[:\s]+([^<\n\r]+)/i);
    if (titleMatch) {
      title = BaseSourceAdapter.stripHtmlTags(titleMatch[1]).replace(/\s*-\s*PT Bursa Efek Indonesia.*$/i, '').trim();
    }

    // Date
    let publishedAt = null;
    // eslint-disable-next-line max-len
    const dateRegex = /(?:tanggal\s+pengumuman|tanggal\s+rilis|date)[:\s]+([0-9]{1,2}[-/ ][A-Za-z0-9]+[-/ ][0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/i;
    const dateMatch = rawHtml.match(dateRegex);
    if (dateMatch) {
      publishedAt = BaseSourceAdapter.normalizeIsoDate(dateMatch[1]);
    }

    // Attachment links (.pdf)
    const pdfMatches = rawHtml.match(/href=["']([^"']+\.pdf[^"']*)["']/gi) || [];
    const attachments = pdfMatches.map((m) => {
      const exec = /href=["']([^"']+)["']/i.exec(m);
      return exec ? exec[1] : '';
    }).filter(Boolean);

    // Body content
    const pMatches = rawHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
    let text = BaseSourceAdapter.cleanParagraphs(pMatches);
    if (!text || text.length < 50) {
      text = BaseSourceAdapter.stripHtmlTags(rawHtml);
    }

    const companies = [];
    const stockTickers = [];
    if (ticker) {
      stockTickers.push(ticker);
      companies.push({ name: `PT ${ticker} Tbk`, ticker, is_primary: true });
    }

    return new UniversalArticleSchema({
      original_url: url,
      canonical_url: url,
      source_name: 'Bursa Efek Indonesia (IDX)',
      source_domain: 'idx.co.id',
      source_type: 'official_exchange',
      title: title || (ticker ? `Pengumuman Keterbukaan Informasi ${ticker}` : 'Pengumuman Bursa Efek Indonesia'),
      subtitle: submissionId ? `No. Registrasi: ${submissionId}` : null,
      description: attachments.length > 0 ? `Lampiran Dokumen: ${attachments[0]}` : null,
      author: 'Divisi Penilaian Perusahaan BEI',
      article_content: text,
      companies,
      stock_tickers: stockTickers,
      language: 'id',
      published_at: publishedAt || new Date().toISOString(),
      extraction_method: 'official_api',
      extraction_confidence: 1.0,
      extraction_status: 'success',
      extraction_warnings: [],
    });
  }
}

module.exports = IDXAdapter;
