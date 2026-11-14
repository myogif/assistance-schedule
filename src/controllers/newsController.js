const processingQueue = require('../newsEngine/queue/ProcessingQueue');
const sourceAdapterRegistry = require('../newsEngine/registry/SourceAdapterRegistry');
const sourceReliabilityRegistry = require('../newsEngine/registry/SourceReliabilityRegistry');
const eventClusterer = require('../newsEngine/clustering/EventClusterer');
const EntityExtractor = require('../newsEngine/entity/EntityExtractor');
const { NewsQueueJob, NewsEventCluster } = require('../models');

const entityExtractor = new EntityExtractor();

/**
 * Controller handling Multi-Source News Ingestion and Processing.
 */
const newsController = {
  /**
   * Ingest single or multiple URLs into the 9-stage asynchronous processing queue.
   */
  async ingest(req, res, next) {
    try {
      const { url, urls, force } = req.body || {};
      let urlList = [];
      if (Array.isArray(urls)) {
        urlList = urls;
      } else if (url) {
        urlList = [url];
      }

      if (urlList.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Please provide either a "url" string or "urls" array in the request body.',
        });
      }

      const jobs = await processingQueue.addBatch(urlList, { force: Boolean(force) });

      return res.status(202).json({
        success: true,
        count: jobs.length,
        jobs: jobs.map((j) => ({
          jobId: j.jobId,
          url: j.url,
          status: j.status,
          stage: j.stage,
          stageName: j.stageName,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Direct parsing of article URL/HTML into UniversalArticleSchema.
   */
  async parse(req, res, next) {
    try {
      const input = req.body || {};
      const targetUrl = typeof input === 'string' ? input : (input.url || input);

      if (!targetUrl && !input.html) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid "url" or "html" in request body.',
        });
      }

      const schema = await sourceAdapterRegistry.extract(input);
      const entityResult = entityExtractor.extractEntities(schema.article_content, schema.title);
      schema.stock_tickers = entityResult.stock_tickers;
      schema.companies = entityResult.companies;
      schema.people = entityResult.people;
      schema.sectors = entityResult.sectors;

      const reliability = sourceReliabilityRegistry.getReliability(schema.canonical_url || schema.original_url);

      return res.status(200).json({
        success: true,
        article: schema.toJSON(),
        reliability,
        legacy: schema.toLegacyArticle(),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Retrieves queue job details, current stage, and execution logs.
   */
  async getJob(req, res, next) {
    try {
      const { id } = req.params;
      const memJob = processingQueue.getJob(id);
      if (memJob) {
        return res.status(200).json({
          success: true,
          job: {
            jobId: memJob.jobId,
            url: memJob.url,
            status: memJob.status,
            stage: memJob.stage,
            stageName: memJob.stageName,
            attempts: memJob.attempts,
            error: memJob.error,
            result: memJob.result,
            logs: memJob.logs,
            createdAt: memJob.createdAt,
            updatedAt: memJob.updatedAt,
          },
        });
      }

      // Check DB
      const dbJob = await NewsQueueJob.findOne({ where: { jobId: id } });
      if (!dbJob) {
        return res.status(404).json({
          success: false,
          error: `Job with ID "${id}" not found.`,
        });
      }

      return res.status(200).json({
        success: true,
        job: dbJob,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Lists active event clusters.
   */
  async getClusters(req, res, next) {
    try {
      const clusters = eventClusterer.getClusters();
      if (clusters.length > 0) {
        return res.status(200).json({
          success: true,
          count: clusters.length,
          data: clusters,
        });
      }

      const dbClusters = await NewsEventCluster.findAll({ order: [['updatedAt', 'DESC']], limit: 50 });
      return res.status(200).json({
        success: true,
        count: dbClusters.length,
        data: dbClusters,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Lists registered sources and reliability tiers.
   */
  async getSources(req, res, next) {
    try {
      const sources = sourceReliabilityRegistry.getAllSources();
      return res.status(200).json({
        success: true,
        sources,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Gets async processing queue status.
   */
  async getQueueStatus(req, res, next) {
    try {
      const status = processingQueue.getQueueStatus();
      return res.status(200).json({
        success: true,
        status,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = newsController;
