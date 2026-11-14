/* eslint-disable no-param-reassign */
const EventEmitter = require('events');
const crypto = require('crypto');
const { NewsArticle, NewsEventCluster, NewsQueueJob } = require('../../models');
const sourceAdapterRegistry = require('../registry/SourceAdapterRegistry');
const sourceReliabilityRegistry = require('../registry/SourceReliabilityRegistry');
const deduplicator = require('../clustering/Deduplicator');
const eventClusterer = require('../clustering/EventClusterer');
const EntityExtractor = require('../entity/EntityExtractor');
const UniversalNewsAnalyzer = require('../analyzer/UniversalNewsAnalyzer');

const STAGES = {
  1: 'INGESTION',
  2: 'VALIDATION',
  3: 'DEDUPLICATION',
  4: 'SCRAPING',
  5: 'NORMALIZATION',
  6: 'ENTITY_EXTRACTION',
  7: 'AI_ANALYSIS',
  8: 'RANKING',
  9: 'CONTENT_RECOMMENDATION',
};

class ProcessingQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = Number(process.env.QUEUE_CONCURRENCY) || options.concurrency || 2;
    this.activeWorkers = 0;
    this.queue = []; // in-memory pending job queue
    this.jobsMap = new Map(); // jobId -> job object
    this.entityExtractor = new EntityExtractor();
    this.analyzer = new UniversalNewsAnalyzer();
    this.maxRetries = 3;
    this.baseBackoffMs = 1000;
  }

  static generateJobId(input) {
    const raw = typeof input === 'string' ? input : (input.url || JSON.stringify(input));
    return `job_${crypto.createHash('sha256').update(raw.toLowerCase().trim()).digest('hex').slice(0, 16)}`;
  }

  /**
   * Adds a single news ingestion job to the queue.
   * @param {string|Object} input - URL string or object { url, html, ... }
   * @param {Object} [options]
   * @returns {Promise<Object>} Job descriptor
   */
  async addJob(input, options = {}) {
    const url = typeof input === 'string' ? input.trim() : (input.url || '');
    const jobId = options.jobId || ProcessingQueue.generateJobId(input);

    // Idempotency check: if job is already pending or processing, return existing
    if (this.jobsMap.has(jobId)) {
      const existing = this.jobsMap.get(jobId);
      if (existing.status === 'queued' || existing.status === 'processing') {
        return existing;
      }
    }

    const job = {
      jobId,
      url,
      input,
      options,
      status: 'queued',
      stage: 1,
      stageName: STAGES[1],
      attempts: 0,
      error: null,
      result: null,
      logs: [`[${new Date().toISOString()}] Job created and queued.`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobsMap.set(jobId, job);
    this.queue.push(job);

    // Persist in DB asynchronously (safe ignore if table not migrated or test in-memory)
    try {
      await NewsQueueJob.upsert({
        jobId,
        url,
        status: job.status,
        stage: job.stage,
        stageName: job.stageName,
        attempts: job.attempts,
        logs: job.logs,
      });
    } catch (err) {
      // Non-fatal if DB not yet synced
    }

    this.emit('queued', job);
    this.processNext();

    return job;
  }

  /**
   * Adds multiple news ingestion jobs in batch.
   */
  async addBatch(inputs = [], options = {}) {
    const jobs = await Promise.all(inputs.map((input) => this.addJob(input, options)));
    return jobs;
  }

  getJob(jobId) {
    return this.jobsMap.get(jobId) || null;
  }

  getQueueStatus() {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    this.jobsMap.forEach((j) => {
      if (j.status === 'queued') queued += 1;
      else if (j.status === 'processing') processing += 1;
      else if (j.status === 'completed') completed += 1;
      else if (j.status === 'failed') failed += 1;
    });

    return {
      queued,
      processing,
      completed,
      failed,
      total: this.jobsMap.size,
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
    };
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers += 1;
    job.status = 'processing';
    job.attempts += 1;

    try {
      await this.executeJobStages(job);
      job.status = 'completed';
      job.logs.push(`[${new Date().toISOString()}] Job completed successfully.`);
      this.emit('completed', job);
    } catch (err) {
      job.error = err.message;
      job.logs.push(`[${new Date().toISOString()}] Error: ${err.message}`);

      if (job.attempts < this.maxRetries) {
        const delay = this.baseBackoffMs * (2 ** (job.attempts - 1));
        job.logs.push(`[${new Date().toISOString()}] Retrying attempt ${job.attempts + 1}/${this.maxRetries} after ${delay}ms...`);
        job.status = 'queued';
        setTimeout(() => {
          this.queue.push(job);
          this.processNext();
        }, delay);
      } else {
        job.status = 'failed';
        this.emit('failed', job, err);
      }
    } finally {
      this.activeWorkers -= 1;
      try {
        await NewsQueueJob.upsert({
          jobId: job.jobId,
          url: job.url,
          status: job.status,
          stage: job.stage,
          stageName: job.stageName,
          attempts: job.attempts,
          error: job.error,
          result: job.result,
          logs: job.logs,
        });
      } catch {
        // Safe db fallback
      }
      this.processNext();
    }
  }

  async updateStage(job, stageNum) {
    job.stage = stageNum;
    job.stageName = STAGES[stageNum];
    job.updatedAt = new Date().toISOString();
    job.logs.push(`[${job.updatedAt}] Stage ${stageNum}: ${STAGES[stageNum]}`);
    this.emit('stage', job, STAGES[stageNum]);
  }

  /**
   * Executes the full 9-stage pipeline on a job.
   */
  async executeJobStages(job) {
    // Stage 1: INGESTION (Already completed upon enqueue)
    await this.updateStage(job, 1);

    // Stage 2: VALIDATION
    await this.updateStage(job, 2);
    const { url } = job;
    if (!url && typeof job.input !== 'object') {
      throw new Error(`Invalid URL or input payload: ${url}`);
    }
    if (url && !/^https?:\/\//i.test(url)) {
      throw new Error(`Invalid HTTP/HTTPS URL: ${url}`);
    }

    // Stage 3: DEDUPLICATION (pre-check via URL)
    await this.updateStage(job, 3);
    let existingArticles = [];
    try {
      existingArticles = await NewsArticle.findAll({ limit: 50, order: [['createdAt', 'DESC']] });
    } catch {
      // In tests/memory mode, empty list is fine
    }

    const preDupCheck = deduplicator.isDuplicate({ canonical_url: url, original_url: url }, existingArticles);
    if (preDupCheck.isDuplicate && !job.options.force) {
      job.result = {
        isDuplicate: true,
        duplicateOf: preDupCheck.duplicateOf,
        matchType: preDupCheck.matchType,
      };
      job.logs.push(`Article is duplicate of ${preDupCheck.duplicateOf} via ${preDupCheck.matchType}`);
      return;
    }

    // Stage 4: SCRAPING (Adapter resolution & 8-level priority cascade)
    await this.updateStage(job, 4);
    const schema = await sourceAdapterRegistry.extract(job.input, job.options);

    // Post-scraping deduplication (content hash & headline overlap)
    const postDupCheck = deduplicator.isDuplicate(schema, existingArticles);
    if (postDupCheck.isDuplicate && !job.options.force) {
      job.result = {
        isDuplicate: true,
        duplicateOf: postDupCheck.duplicateOf,
        matchType: postDupCheck.matchType,
      };
      job.logs.push(`Article content is duplicate of ${postDupCheck.duplicateOf} via ${postDupCheck.matchType}`);
      return;
    }

    // Stage 5: NORMALIZATION
    await this.updateStage(job, 5);
    if (!schema.title && !schema.article_content) {
      throw new Error('Normalization failed: Extracted article has no title and no content.');
    }

    // Stage 6: ENTITY EXTRACTION
    await this.updateStage(job, 6);
    const entityResult = this.entityExtractor.extractEntities(schema.article_content, schema.title);
    schema.stock_tickers = entityResult.stock_tickers;
    schema.companies = entityResult.companies;
    schema.people = entityResult.people;
    schema.sectors = entityResult.sectors;

    // Stage 7: AI ANALYSIS
    await this.updateStage(job, 7);
    const aiAnalysis = await this.analyzer.analyze(schema);

    // Stage 8: RANKING
    await this.updateStage(job, 8);
    const reliability = sourceReliabilityRegistry.getReliability(schema.canonical_url || schema.original_url);
    const importance = aiAnalysis.importance_score || 5;
    // news priority score = (trustScore * 0.4) + (importance / 10 * 0.4) + (timeliness * 0.2)
    const priorityScore = Number(((reliability.trustScore * 0.4) + ((importance / 10) * 0.4) + 0.2).toFixed(2));

    // Event Clustering
    const clusterRes = eventClusterer.clusterArticle(schema);

    // Stage 9: CONTENT RECOMMENDATION
    await this.updateStage(job, 9);
    const recommendation = {
      recommended_format: aiAnalysis.recommended_format || 'single',
      priority_score: priorityScore,
      target_niche: 'finance',
      publishing_urgency: priorityScore >= 0.8 ? 'IMMEDIATE' : 'SCHEDULED_SLOT',
      cluster_id: clusterRes.cluster.cluster_id,
      is_cluster_update: clusterRes.isUpdate,
    };

    // Persist Article in DB
    try {
      await NewsArticle.upsert({
        articleId: schema.article_id,
        canonicalUrl: schema.canonical_url || schema.original_url,
        originalUrl: schema.original_url,
        sourceName: schema.source_name,
        sourceDomain: schema.source_domain,
        sourceType: schema.source_type,
        title: schema.title,
        subtitle: schema.subtitle,
        description: schema.description,
        author: schema.author,
        articleContent: schema.article_content,
        images: schema.images,
        language: schema.language,
        publishedAt: schema.published_at ? new Date(schema.published_at) : null,
        companies: schema.companies,
        stockTickers: schema.stock_tickers,
        people: schema.people,
        sectors: schema.sectors,
        extractionMethod: schema.extraction_method,
        extractionConfidence: schema.extraction_confidence,
        extractionStatus: schema.extraction_status,
        extractionWarnings: schema.extraction_warnings,
      });

      await NewsEventCluster.upsert({
        clusterId: clusterRes.cluster.cluster_id,
        topicTitle: clusterRes.cluster.topic_title,
        primaryEntity: clusterRes.cluster.primary_entity,
        eventCategory: clusterRes.cluster.event_category,
        articles: clusterRes.cluster.articles,
      });
    } catch (err) {
      job.logs.push(`[DB Notice] Article persistence non-fatal skip: ${err.message}`);
    }

    job.result = {
      article: schema.toJSON(),
      analysis: aiAnalysis,
      recommendation,
      cluster: clusterRes.cluster,
    };
  }
}

// Singleton instance
const defaultQueue = new ProcessingQueue();
defaultQueue.ProcessingQueue = ProcessingQueue;
defaultQueue.STAGES = STAGES;

module.exports = defaultQueue;
