const idxCompanies = require('../../data/idxCompanies.json');

// Ambiguous words that happen to be 4 uppercase letters matching real tickers
const AMBIGUOUS_TICKERS = new Set([
  'EMAS', 'BUMI', 'KOTA', 'PADI', 'ASRI', 'CASH', 'TRUE', 'PADA', 'SAYA', 'KITA',
  'IKAN', 'KOPI', 'ROTI', 'BOLA', 'HOME', 'GOOD', 'FIRE', 'AUTO', 'CARE', 'FAST',
  'FOOD', 'EAST', 'STAR', 'BEST', 'BELL', 'BLUE', 'BOSS', 'CAMP', 'CITY', 'DEAL',
  'GOLD', 'HERO', 'HOPE', 'LAND', 'LINK', 'LION', 'MICE', 'MINA', 'NASA', 'NATO',
  'PACK', 'PALM', 'POOL', 'PORT', 'PURE', 'REAL', 'REPO', 'RISE', 'ROCK', 'RODA',
  'SAGE', 'SAME', 'SURE', 'TAMA', 'TECH', 'TIME', 'TOOL', 'TOPS', 'TOYS', 'TRIP',
  'UANG', 'WIFE', 'WINE', 'WOOD',
]);

const VERIFIED_FIGURES = {
  prabowo: { name: 'Prabowo Subianto', role: 'Presiden RI' },
  'prabowo subianto': { name: 'Prabowo Subianto', role: 'Presiden RI' },
  gibran: { name: 'Gibran Rakabuming Raka', role: 'Wakil Presiden RI' },
  'gibran rakabuming': { name: 'Gibran Rakabuming Raka', role: 'Wakil Presiden RI' },
  'gibran rakabuming raka': { name: 'Gibran Rakabuming Raka', role: 'Wakil Presiden RI' },
  jokowi: { name: 'Joko Widodo', role: 'Presiden ke-7 RI' },
  'joko widodo': { name: 'Joko Widodo', role: 'Presiden ke-7 RI' },
  'sri mulyani': { name: 'Sri Mulyani Indrawati', role: 'Menteri Keuangan RI' },
  'sri mulyani indrawati': { name: 'Sri Mulyani Indrawati', role: 'Menteri Keuangan RI' },
  'thomas djiwandono': { name: 'Thomas Djiwandono', role: 'Wakil Menteri Keuangan RI' },
  'suahasil nazara': { name: 'Suahasil Nazara', role: 'Wakil Menteri Keuangan RI' },
  'perry warjiyo': { name: 'Perry Warjiyo', role: 'Gubernur Bank Indonesia' },
  'destry damayanti': { name: 'Destry Damayanti', role: 'Deputi Gubernur Senior BI' },
  'mahendra siregar': { name: 'Mahendra Siregar', role: 'Ketua Dewan Komisioner OJK' },
  'inarno djajadi': { name: 'Inarno Djajadi', role: 'Kepala Eksekutif PMDK OJK' },
  'erick thohir': { name: 'Erick Thohir', role: 'Menteri BUMN RI' },
  'kartika wirjoatmodjo': { name: 'Kartika Wirjoatmodjo', role: 'Wakil Menteri BUMN RI' },
  'tiko wirjoatmodjo': { name: 'Kartika Wirjoatmodjo', role: 'Wakil Menteri BUMN RI' },
  'luhut binsar pandjaitan': { name: 'Luhut Binsar Pandjaitan', role: 'Penasihat Khusus Presiden' },
  'luhut pandjaitan': { name: 'Luhut Binsar Pandjaitan', role: 'Penasihat Khusus Presiden' },
  'bahlil lahadalia': { name: 'Bahlil Lahadalia', role: 'Menteri ESDM RI' },
  'muliaman hadad': { name: 'Muliaman D. Hadad', role: 'Kepala BP Investasi Danantara' },
  'pandu sjahrir': { name: 'Pandu Sjahrir', role: 'Ketua Umum AFTECH' },
  'purbaya yudhi sadewa': { name: 'Purbaya Yudhi Sadewa', role: 'Ketua Dewan Komisioner LPS' },
  'iman rachman': { name: 'Iman Rachman', role: 'Direktur Utama PT Bursa Efek Indonesia' },
  'jahja setiaatmadja': { name: 'Jahja Setiaatmadja', role: 'Presiden Direktur PT Bank Central Asia Tbk' },
  'darmawan junaidi': { name: 'Darmawan Junaidi', role: 'Direktur Utama PT Bank Mandiri Tbk' },
  sunarso: { name: 'Sunarso', role: 'Direktur Utama PT Bank Rakyat Indonesia Tbk' },
  'royke tumilaar': { name: 'Royke Tumilaar', role: 'Direktur Utama PT Bank Negara Indonesia Tbk' },
  'anthony salim': { name: 'Anthoni Salim', role: 'Pemimpin Salim Group' },
  'anthoni salim': { name: 'Anthoni Salim', role: 'Pemimpin Salim Group' },
  'prajogo pangestu': { name: 'Prajogo Pangestu', role: 'Pendiri Barito Pacific Group' },
  'low tuck kwong': { name: 'Low Tuck Kwong', role: 'Pendiri Bayan Resources' },
  'budi hartono': { name: 'Robert Budi Hartono', role: 'Pemilik Djarum Group' },
  'robert budi hartono': { name: 'Robert Budi Hartono', role: 'Pemilik Djarum Group' },
  'michael hartono': { name: 'Michael Bambang Hartono', role: 'Pemilik Djarum Group' },
  'chairul tanjung': { name: 'Chairul Tanjung', role: 'Pemilik CT Corp' },
  'garibaldi thohir': { name: 'Garibaldi Thohir', role: 'Presiden Direktur PT Adaro Energy Indonesia Tbk' },
  'boy thohir': { name: 'Garibaldi Thohir', role: 'Presiden Direktur PT Adaro Energy Indonesia Tbk' },
};

const INSTITUTIONS = [
  { match: /\b(?:bank indonesia|bi)\b/i, name: 'Bank Indonesia (BI)' },
  { match: /\b(?:otoritas jasa keuangan|ojk)\b/i, name: 'Otoritas Jasa Keuangan (OJK)' },
  { match: /\b(?:kemenkeu|kementerian keuangan)\b/i, name: 'Kementerian Keuangan RI' },
  { match: /\b(?:kementerian bumn)\b/i, name: 'Kementerian BUMN' },
  { match: /\b(?:bursa efek indonesia|bei|idx)\b/i, name: 'Bursa Efek Indonesia (IDX)' },
  { match: /\b(?:badan pengelola investasi danantara|danantara)\b/i, name: 'BPI Danantara' },
  { match: /\b(?:lembaga penjamin simpanan|lps)\b/i, name: 'Lembaga Penjamin Simpanan (LPS)' },
];

const BUSINESS_GROUPS = [
  { match: /\bdjarum(?:\s+group)?\b/i, name: 'Djarum Group' },
  { match: /\bastra(?:\s+international|\s+group)?\b/i, name: 'Astra Group' },
  { match: /\bsalim(?:\s+group)?\b/i, name: 'Salim Group' },
  { match: /\bsinarmas(?:\s+group)?\b/i, name: 'Sinar Mas Group' },
  { match: /\bbarito(?:\s+pacific|\s+group)?\b/i, name: 'Barito Pacific Group' },
  { match: /\blippo(?:\s+group)?\b/i, name: 'Lippo Group' },
  { match: /\bmnc(?:\s+group)?\b/i, name: 'MNC Group' },
  { match: /\bbakrie(?:\s+group)?\b/i, name: 'Bakrie Group' },
  { match: /\bct\s+corp\b/i, name: 'CT Corp' },
  { match: /\badaro(?:\s+group)?\b/i, name: 'Adaro Group' },
  { match: /\bharita(?:\s+group)?\b/i, name: 'Harita Group' },
];

const SECTOR_KEYWORDS = {
  Perbankan: [/\b(?:bank|perbankan|kredit|dpk|bunga|nim|npl|bca|bri|mandiri|bni|btn|cimb)\b/i],
  Energi: [/\b(?:batu bara|batubara|minyak|gas|migas|crude|oil|coal|energi|listrik|geothermal|pln)\b/i],
  'Bahan Baku': [/\b(?:nikel|nickel|tembaga|emas|timah|tambang|smelter|baja|semen|kimia)\b/i],
  Konsumer: [/\b(?:fmcg|konsumsi|retail|ritel|makanan|minuman|rokok|minimarket|supermarket)\b/i],
  Teknologi: [/\b(?:e-commerce|fintech|startup|teknologi|digital|telko|telekomunikasi|data center)\b/i],
  Infrastruktur: [/\b(?:jalan tol|konstruksi|menara|tower|pelabuhan|bandara|infrastruktur)\b/i],
  Properti: [/\b(?:properti|perumahan|apartemen|residensial|lahan|kawasan industri)\b/i],
  Kesehatan: [/\b(?:rumah sakit|farmasi|obat|medis|kesehatan|klinik)\b/i],
};

class EntityExtractor {
  constructor() {
    this.tickerMap = new Map();
    this.aliasMap = new Map();

    idxCompanies.forEach((comp) => {
      this.tickerMap.set(comp.ticker.toUpperCase(), comp);
      if (Array.isArray(comp.aliases)) {
        comp.aliases.forEach((alias) => {
          this.aliasMap.set(alias.toLowerCase().trim(), comp);
        });
      }
    });
  }

  /**
   * Extracts tickers, companies, people, sectors, and confidence.
   * @param {string} text - article body
   * @param {string} [title=''] - article headline
   * @returns {{ stock_tickers: string[], companies: Array<{name: string, ticker: string|null, is_primary: boolean}>, people: Array<{name: string, role: string|null}>, sectors: string[], confidence: number, evidence: Object }}
   */
  extractEntities(text = '', title = '') {
    const combined = `${title}\n${text}`;
    const detectedTickers = new Set();
    const detectedCompanies = new Map(); // ticker -> { name, ticker, is_primary }
    const detectedPeople = new Map();
    const detectedSectors = new Set();
    const evidence = {
      tickers: [], people: [], institutions: [], groups: [],
    };

    // 1. Explicit Ticker Regex Match
    // Patterns: $TICK, saham TICK, emiten TICK, kode TICK, or bare 4-letter uppercase word
    const tickerRegex = /(?:(\$|saham\s+|emiten\s+|kode\s+))?\b([A-Z]{4})\b/g;
    let match = tickerRegex.exec(combined);
    while (match !== null) {
      const prefix = match[1] ? match[1].toLowerCase() : '';
      const candidate = match[2];

      if (this.tickerMap.has(candidate)) {
        const isAmbiguous = AMBIGUOUS_TICKERS.has(candidate);
        // Ambiguous tickers require financial prefix or dollar sign or inclusion in title
        if (isAmbiguous) {
          const hasFinancialPrefix = Boolean(prefix && (prefix.includes('$') || prefix.includes('saham') || prefix.includes('emiten') || prefix.includes('kode')));
          const inTitleWithContext = title.includes(candidate) && /(?:saham|emiten|ihsg|laba|dividen|kinerja|naik|turun)/i.test(title);
          if (hasFinancialPrefix || inTitleWithContext) {
            detectedTickers.add(candidate);
            evidence.tickers.push({ ticker: candidate, context: match[0] });
          }
        } else {
          detectedTickers.add(candidate);
          evidence.tickers.push({ ticker: candidate, context: match[0] });
        }
      }
      match = tickerRegex.exec(combined);
    }

    // 2. Company Name & Alias Resolution
    const lowerCombined = combined.toLowerCase();
    // Check known aliases
    this.aliasMap.forEach((comp, alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (aliasRegex.test(lowerCombined)) {
        detectedTickers.add(comp.ticker);
        const inTitle = new RegExp(`\\b${escaped}\\b`, 'i').test(title);
        detectedCompanies.set(comp.ticker, {
          name: comp.name,
          ticker: comp.ticker,
          is_primary: inTitle || false,
        });
      }
    });

    // Populate company objects from tickers if not already populated
    detectedTickers.forEach((ticker) => {
      const comp = this.tickerMap.get(ticker);
      if (comp && !detectedCompanies.has(ticker)) {
        const inTitle = title.toUpperCase().includes(ticker);
        detectedCompanies.set(ticker, {
          name: comp.name,
          ticker: comp.ticker,
          is_primary: inTitle,
        });
      }
      if (comp && comp.sector && comp.sector !== 'Umum') {
        detectedSectors.add(comp.sector);
      }
    });

    // If no company is marked primary, mark the first one primary
    const companyList = Array.from(detectedCompanies.values());
    if (companyList.length > 0 && !companyList.some((c) => c.is_primary)) {
      companyList[0].is_primary = true;
    }

    // 3. Public Figures Extraction
    Object.entries(VERIFIED_FIGURES).forEach(([key, fig]) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const figRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (figRegex.test(lowerCombined)) {
        detectedPeople.set(fig.name, fig);
        evidence.people.push(fig.name);
      }
    });

    // 4. Institutions & Regulators
    INSTITUTIONS.forEach((inst) => {
      if (inst.match.test(lowerCombined)) {
        evidence.institutions.push(inst.name);
      }
    });

    // 5. Business Groups
    BUSINESS_GROUPS.forEach((grp) => {
      if (grp.match.test(lowerCombined)) {
        evidence.groups.push(grp.name);
      }
    });

    // 6. Sector Detection from Keywords
    Object.entries(SECTOR_KEYWORDS).forEach(([sector, patterns]) => {
      if (patterns.some((p) => p.test(lowerCombined))) {
        detectedSectors.add(sector);
      }
    });

    // 7. Confidence Calculation
    let confidence = 0.5;
    if (detectedTickers.size > 0) confidence += 0.3;
    if (detectedPeople.size > 0) confidence += 0.1;
    if (detectedSectors.size > 0) confidence += 0.1;
    confidence = Math.min(1.0, confidence);

    return {
      stock_tickers: Array.from(detectedTickers),
      companies: companyList,
      people: Array.from(detectedPeople.values()),
      sectors: Array.from(detectedSectors),
      confidence,
      evidence,
    };
  }
}

module.exports = EntityExtractor;
