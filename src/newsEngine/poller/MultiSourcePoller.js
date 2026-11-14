/* eslint-disable no-continue, global-require */
/**
 * Multi-Source Financial News RSS & API Poller
 *
 * Ingests financial news from verified media RSS feeds (CNBC Indonesia, Kontan,
 * Antara, Tempo), parses descriptors, feeds new articles to ProcessingQueue,
 * and retrieves ranked, cluster-deduplicated articles for broadcast.
 */

const RSSAdapter = require('../adapters/RSSAdapter');
const defaultQueue = require('../queue/ProcessingQueue');
const UniversalArticleSchema = require('../schema/UniversalArticleSchema');

const DEFAULT_FEEDS = [
  'https://www.cnbcindonesia.com/market/rss',
  'https://insight.kontan.co.id/rss',
  'https://www.antaranews.com/rss/ekonomi-finansial.xml',
  'https://rss.tempo.co/bisnis',
];

/**
 * Normalizes an article URL by removing marketing tracking parameters and trailing slashes.
 * @param {string} rawUrl
 * @returns {string}
 */
function normalizeArticleUrl(rawUrl = '') {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl.trim());
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'ref'];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Formats an ISO or timestamp date string to human-readable Indonesian format.
 * @param {string|Date} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

class MultiSourcePoller {
  constructor(options = {}) {
    this.queue = options.queue || defaultQueue;
    this.feedUrls = options.feedUrls || this.getFeedUrls();
  }

  /**
   * Retrieves configured feed URLs from environment or defaults.
   * @returns {string[]}
   */
  getFeedUrls() {
    if (process.env.NEWS_FEED_URLS) {
      return process.env.NEWS_FEED_URLS
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
    }
    return [...DEFAULT_FEEDS];
  }

  /**
   * Fetches RSS/XML feeds concurrently with an 8-second timeout per feed.
   * @param {string[]} [feedUrls=this.feedUrls]
   * @returns {Promise<Array<{ title: string, url: string, date: string, description: string, content: string, imageUrl: string|null, sourceName: string, domain: string }>>}
   */
  async fetchFeedArticles(feedUrls = this.feedUrls) {
    const urls = Array.isArray(feedUrls) ? feedUrls : [feedUrls];
    const fetchPromises = urls.map(async (feedUrl) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        let res;
        try {
          res = await fetch(feedUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FinancialNewsBot/1.0',
              Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            },
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          console.warn(`[MultiSourcePoller] HTTP ${res.status} when fetching feed: ${feedUrl}`);
          return [];
        }

        const xml = await res.text();
        const rawItems = RSSAdapter.parseFeedXml(xml);

        return rawItems
          .map((item) => {
            const normalizedUrl = normalizeArticleUrl(item.link);
            if (!normalizedUrl) return null;
            const domain = UniversalArticleSchema.extractDomain(normalizedUrl);
            const sourceName = UniversalArticleSchema.extractSourceName(normalizedUrl);
            return {
              title: item.title || '',
              url: normalizedUrl,
              date: item.pubDate ? formatDate(item.pubDate) : '',
              pubDateIso: item.pubDate || null,
              description: item.description || '',
              content: item.content || item.description || '',
              imageUrl: item.imageUrl || null,
              sourceName,
              domain,
            };
          })
          .filter(Boolean);
      } catch (err) {
        console.warn(`[MultiSourcePoller] Failed to fetch feed ${feedUrl}:`, err.message);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    return results.flat();
  }

  /**
   * Discovers new URLs from feeds and adds them to the ProcessingQueue.
   * Awaits completion of the newly added batch.
   * @param {string[]} [feedUrls]
   * @param {Object} [options]
   * @returns {Promise<{ discovered: number, enqueued: number, jobs: Array<Object> }>}
   */
  async syncFeedsToQueue(feedUrls = this.feedUrls, options = {}) {
    const articles = await this.fetchFeedArticles(feedUrls);
    if (!articles || articles.length === 0) {
      return { discovered: 0, enqueued: 0, jobs: [] };
    }

    const newItems = [];
    const seenUrlsInBatch = new Set();

    for (let i = 0; i < articles.length; i += 1) {
      const art = articles[i];
      if (seenUrlsInBatch.has(art.url)) continue;
      seenUrlsInBatch.add(art.url);

      const jobId = defaultQueue.ProcessingQueue
        ? defaultQueue.ProcessingQueue.generateJobId(art.url)
        : `job_${art.url}`;

      // Check if job is already in queue memory
      if (this.queue.jobsMap && this.queue.jobsMap.has(jobId)) {
        continue;
      }

      // Check if URL excluded
      if (options.excludeUrls) {
        const isExcluded = options.excludeUrls instanceof Set
          ? options.excludeUrls.has(art.url)
          : options.excludeUrls.includes(art.url);
        if (isExcluded) continue;
      }

      newItems.push({
        url: art.url,
        title: art.title,
        description: art.description,
        content: art.content,
        imageUrl: art.imageUrl,
        date: art.date,
        sourceName: art.sourceName,
        domain: art.domain,
      });
    }

    if (newItems.length === 0) {
      return { discovered: articles.length, enqueued: 0, jobs: [] };
    }

    const jobs = await this.queue.addBatch(newItems, options);

    // Await execution of the batch with safety timeout (up to 15s)
    await this._waitForBatch(jobs, options.batchTimeoutMs || 15000);

    return {
      discovered: articles.length,
      enqueued: newItems.length,
      jobs,
    };
  }

  /**
   * Waits for a list of queue jobs to reach completed or failed state.
   * @private
   */
  _waitForBatch(jobs, timeoutMs = 15000) {
    if (!Array.isArray(jobs) || jobs.length === 0) return Promise.resolve();

    return new Promise((resolve) => {
      let isSettled = false;
      const timeout = setTimeout(() => {
        isSettled = true;
        resolve();
      }, timeoutMs);

      const checkAllDone = () => {
        if (isSettled) return;
        const allDone = jobs.every(
          (j) => j.status === 'completed' || j.status === 'failed',
        );
        if (allDone) {
          isSettled = true;
          clearTimeout(timeout);
          this.queue.off('completed', checkAllDone);
          this.queue.off('failed', checkAllDone);
          resolve();
        }
      };

      this.queue.on('completed', checkAllDone);
      this.queue.on('failed', checkAllDone);
      checkAllDone();
    });
  }

  /**
   * Retrieves top ranked articles across media sources.
   * Applies priority scoring, cluster update boosts, recency sorting,
   * and cluster-aware deduplication.
   *
   * @param {Object} [options]
   * @param {Set<string>|Array<string>} [options.excludeUrls]
   * @param {number} [options.limit=5]
   * @param {number} [options.minScore=0.0]
   * @param {boolean} [options.filterClusterDuplicates=true]
   * @returns {Promise<Array<Object>>}
   */
  async getTopRankedArticles(options = {}) {
    const limit = typeof options.limit === 'number' ? options.limit : 5;
    const minScore = typeof options.minScore === 'number' ? options.minScore : 0.0;
    const filterClusterDuplicates = options.filterClusterDuplicates !== false;
    const excludeUrls = options.excludeUrls || null;

    /** @type {Map<string, Object>} */
    const candidatesMap = new Map();

    // 1. Collect from ProcessingQueue in-memory jobs
    if (this.queue.jobsMap) {
      this.queue.jobsMap.forEach((job) => {
        if (job.status !== 'completed' || !job.result) return;
        if (job.result.isDuplicate) return;

        const article = job.result.article || {};
        const url = article.canonical_url || article.original_url || job.url;
        if (!url) return;

        const rec = job.result.recommendation || {};
        const analysis = job.result.analysis || {};
        const cluster = job.result.cluster || {};

        const priorityScore = typeof rec.priority_score === 'number' ? rec.priority_score : 0.5;
        if (priorityScore < minScore) return;

        let executiveSummary = article.description || '';
        if (Array.isArray(analysis.executive_summary)) {
          executiveSummary = analysis.executive_summary.join(' ');
        } else if (typeof analysis.executive_summary === 'string') {
          executiveSummary = analysis.executive_summary;
        }

        candidatesMap.set(url, {
          url,
          title: article.title || '',
          description: article.description || '',
          executiveSummary,
          content: article.article_content || '',
          date: formatDate(article.published_at || article.first_seen_at || job.createdAt),
          publishedAt: article.published_at || null,
          createdAt: job.createdAt || article.first_seen_at || new Date().toISOString(),
          sourceName: article.source_name || UniversalArticleSchema.extractSourceName(url),
          domain: article.source_domain || UniversalArticleSchema.extractDomain(url),
          stockTickers: Array.isArray(article.stock_tickers) ? article.stock_tickers : [],
          eventCategory: cluster.event_category || 'UMUM',
          priorityScore,
          isClusterUpdate: Boolean(rec.is_cluster_update),
          clusterId: rec.cluster_id || cluster.cluster_id || null,
          recommendedFormat: rec.recommended_format || 'single',
          rawJob: job,
        });
      });
    }

    // 2. Safely merge from DB NewsQueueJob if model available and in-memory is sparse
    try {
      const { NewsQueueJob } = require('../../models');
      if (NewsQueueJob && typeof NewsQueueJob.findAll === 'function') {
        const dbJobs = await NewsQueueJob.findAll({
          where: { status: 'completed' },
          order: [['createdAt', 'DESC']],
          limit: 50,
        });
        dbJobs.forEach((dj) => {
          const res = dj.result;
          if (!res || res.isDuplicate) return;
          const article = res.article || {};
          const url = article.canonical_url || article.original_url || dj.url;
          if (!url || candidatesMap.has(url)) return;

          const rec = res.recommendation || {};
          const analysis = res.analysis || {};
          const cluster = res.cluster || {};
          const priorityScore = typeof rec.priority_score === 'number' ? rec.priority_score : 0.5;
          if (priorityScore < minScore) return;

          candidatesMap.set(url, {
            url,
            title: article.title || '',
            description: article.description || '',
            executiveSummary: Array.isArray(analysis.executive_summary)
              ? analysis.executive_summary.join(' ')
              : (analysis.executive_summary || article.description || ''),
            content: article.article_content || '',
            date: formatDate(article.published_at || article.first_seen_at || dj.createdAt),
            publishedAt: article.published_at || null,
            createdAt: dj.createdAt || article.first_seen_at || new Date().toISOString(),
            sourceName: article.source_name || UniversalArticleSchema.extractSourceName(url),
            domain: article.source_domain || UniversalArticleSchema.extractDomain(url),
            stockTickers: Array.isArray(article.stock_tickers) ? article.stock_tickers : [],
            eventCategory: cluster.event_category || 'UMUM',
            priorityScore,
            isClusterUpdate: Boolean(rec.is_cluster_update),
            clusterId: rec.cluster_id || cluster.cluster_id || null,
            recommendedFormat: rec.recommended_format || 'single',
            rawJob: dj,
          });
        });
      }
    } catch {
      // Ignore DB errors during standalone unit tests
    }

    let candidates = Array.from(candidatesMap.values());

    // 3. Filter excluded URLs
    if (excludeUrls) {
      candidates = candidates.filter((c) => {
        if (excludeUrls instanceof Set) return !excludeUrls.has(c.url);
        if (Array.isArray(excludeUrls)) return !excludeUrls.includes(c.url);
        return true;
      });
    }

    // 4. Sort candidates:
    //    1. Priority score descending (with 0.05 boost for cluster updates)
    //    2. Recency descending (publishedAt or createdAt)
    candidates.sort((a, b) => {
      const scoreA = a.priorityScore + (a.isClusterUpdate ? 0.05 : 0);
      const scoreB = b.priorityScore + (b.isClusterUpdate ? 0.05 : 0);
      if (Math.abs(scoreB - scoreA) > 0.001) {
        return scoreB - scoreA;
      }
      const timeA = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    // 5. Cluster-Aware Deduplication:
    //    If multiple outlets cover the exact same cluster, keep only the highest-scoring article.
    const deduped = [];
    const seenClusters = new Set();

    for (let i = 0; i < candidates.length; i += 1) {
      const art = candidates[i];
      if (filterClusterDuplicates && art.clusterId) {
        if (seenClusters.has(art.clusterId)) {
          continue;
        }
        seenClusters.add(art.clusterId);
      }
      deduped.push(art);
      if (limit > 0 && deduped.length >= limit) {
        break;
      }
    }

    return deduped;
  }
}

// Singleton export
const defaultPoller = new MultiSourcePoller();
defaultPoller.MultiSourcePoller = MultiSourcePoller;
defaultPoller.DEFAULT_FEEDS = DEFAULT_FEEDS;
defaultPoller.normalizeArticleUrl = normalizeArticleUrl;
defaultPoller.formatDate = formatDate;

module.exports = defaultPoller;
