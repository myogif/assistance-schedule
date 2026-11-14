/**
 * Source Reliability Registry distinguishing trust tiers per Requirement J.
 */

const TIERS = {
  OFFICIAL_PRIMARY: {
    tier: 'OFFICIAL_PRIMARY',
    trustScore: 1.0,
    requiresPrimaryVerification: false,
    isPrimarySource: true,
  },
  ESTABLISHED_FINANCIAL_MEDIA: {
    tier: 'ESTABLISHED_FINANCIAL_MEDIA',
    trustScore: 0.85,
    requiresPrimaryVerification: false,
    isPrimarySource: false,
  },
  GENERAL_NEWS_MEDIA: {
    tier: 'GENERAL_NEWS_MEDIA',
    trustScore: 0.70,
    requiresPrimaryVerification: true,
    isPrimarySource: false,
  },
  COMMUNITY_DISCUSSIONS: {
    tier: 'COMMUNITY_DISCUSSIONS',
    trustScore: 0.40,
    requiresPrimaryVerification: true,
    isPrimarySource: false,
  },
  UNVERIFIED: {
    tier: 'UNVERIFIED',
    trustScore: 0.20,
    requiresPrimaryVerification: true,
    isPrimarySource: false,
  },
};

const DEFAULT_SOURCES = {
  // 1. Official Primary
  'idx.co.id': TIERS.OFFICIAL_PRIMARY,
  'bi.go.id': TIERS.OFFICIAL_PRIMARY,
  'ojk.go.id': TIERS.OFFICIAL_PRIMARY,
  'kemenkeu.go.id': TIERS.OFFICIAL_PRIMARY,
  'bumn.go.id': TIERS.OFFICIAL_PRIMARY,
  'setneg.go.id': TIERS.OFFICIAL_PRIMARY,

  // 2. Established Financial Media
  'cnbcindonesia.com': TIERS.ESTABLISHED_FINANCIAL_MEDIA,
  'kontan.co.id': TIERS.ESTABLISHED_FINANCIAL_MEDIA,
  'bisnis.com': TIERS.ESTABLISHED_FINANCIAL_MEDIA,
  'invezgo.com': TIERS.ESTABLISHED_FINANCIAL_MEDIA,
  'bloombergtechnoz.com': TIERS.ESTABLISHED_FINANCIAL_MEDIA,
  'investor.id': TIERS.ESTABLISHED_FINANCIAL_MEDIA,

  // 3. General News Media
  'kompas.com': TIERS.GENERAL_NEWS_MEDIA,
  'detik.com': TIERS.GENERAL_NEWS_MEDIA,
  'tempo.co': TIERS.GENERAL_NEWS_MEDIA,
  'antara.news': TIERS.GENERAL_NEWS_MEDIA,
  'antaranews.com': TIERS.GENERAL_NEWS_MEDIA,
  'cnnindonesia.com': TIERS.GENERAL_NEWS_MEDIA,

  // 4. Community Discussions
  'stockbit.com': TIERS.COMMUNITY_DISCUSSIONS,
  'x.com': TIERS.COMMUNITY_DISCUSSIONS,
  'twitter.com': TIERS.COMMUNITY_DISCUSSIONS,
};

class SourceReliabilityRegistry {
  constructor() {
    this.sources = new Map(Object.entries(DEFAULT_SOURCES));
  }

  static normalizeDomain(domainOrUrl) {
    if (!domainOrUrl) return '';
    try {
      if (/^https?:\/\//i.test(domainOrUrl)) {
        const parsed = new URL(domainOrUrl);
        return parsed.hostname.replace(/^www\./i, '').toLowerCase();
      }
      return domainOrUrl.replace(/^www\./i, '').toLowerCase().trim();
    } catch {
      return String(domainOrUrl).toLowerCase().trim();
    }
  }

  getReliability(domainOrUrl) {
    const domain = SourceReliabilityRegistry.normalizeDomain(domainOrUrl);
    if (!domain) {
      return { domain: '', ...TIERS.UNVERIFIED };
    }

    // Direct match
    if (this.sources.has(domain)) {
      return { domain, ...this.sources.get(domain) };
    }

    // Check subdomain / parent domain match (e.g. market.bisnis.com -> bisnis.com)
    const entries = Array.from(this.sources.entries());
    for (let i = 0; i < entries.length; i += 1) {
      const [knownDomain, tierData] = entries[i];
      if (domain === knownDomain || domain.endsWith(`.${knownDomain}`)) {
        return { domain, ...tierData };
      }
    }

    // Default unknown domain to UNVERIFIED
    return { domain, ...TIERS.UNVERIFIED };
  }

  registerSource(domain, config) {
    const cleanDomain = SourceReliabilityRegistry.normalizeDomain(domain);
    if (!cleanDomain) return;

    const baseTier = (config && config.tier && TIERS[config.tier]) ? TIERS[config.tier] : TIERS.UNVERIFIED;
    this.sources.set(cleanDomain, {
      ...baseTier,
      ...(config || {}),
    });
  }

  getAllSources() {
    const obj = {};
    this.sources.forEach((v, d) => {
      obj[d] = v;
    });
    return obj;
  }
}

// Export singleton instance as default, class as property
const defaultRegistry = new SourceReliabilityRegistry();
defaultRegistry.SourceReliabilityRegistry = SourceReliabilityRegistry;
defaultRegistry.TIERS = TIERS;

module.exports = defaultRegistry;
