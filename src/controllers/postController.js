const { Op } = require('sequelize');
const { PostLog, Niche } = require('../models');
const pipelineService = require('../services/pipelineService');

/**
 * List post logs with pagination, filtering, and search.
 */
async function listPosts(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { nicheCode, status, search } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { articleTitle: { [Op.like]: `%${search}%` } },
        { articleSource: { [Op.like]: `%${search}%` } },
      ];
    }

    const nicheInclude = {
      model: Niche,
      as: 'niche',
      attributes: ['id', 'code', 'name'],
    };

    if (nicheCode) {
      nicheInclude.where = { code: nicheCode };
    }

    const { count: total, rows: items } = await PostLog.findAndCountAll({
      where,
      include: [nicheInclude],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get detailed post log by ID.
 */
async function getPostById(req, res, next) {
  try {
    const { id } = req.params;
    const post = await PostLog.findByPk(id, {
      include: [{ model: Niche, as: 'niche', attributes: ['id', 'code', 'name'] }],
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Post log with id ${id} not found`,
          statusCode: 404,
        },
      });
    }

    return res.json({
      success: true,
      data: post,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new post and run the processing pipeline.
 */
async function createPost(req, res, next) {
  try {
    const {
      nicheCode = 'finance',
      input,
      dryRun = false,
      skipPublish = false,
    } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required field: input',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
    }

    const result = await pipelineService.runPipeline({
      nicheCode,
      input,
      triggeredBy: 'api',
      dryRun: Boolean(dryRun),
      skipPublish: Boolean(skipPublish),
    });

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retry a post log run.
 */
async function retryPost(req, res, next) {
  try {
    const { id } = req.params;
    const post = await PostLog.findByPk(id, {
      include: [{ model: Niche, as: 'niche', attributes: ['id', 'code', 'name'] }],
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Post log with id ${id} not found`,
          statusCode: 404,
        },
      });
    }

    const nicheCode = post.niche?.code || 'finance';
    const input = post.articleUrl || post.articleContent || post.articleTitle;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot retry post: No article input found on record',
          statusCode: 400,
        },
      });
    }

    const { dryRun = false, skipPublish = false } = req.body;

    const result = await pipelineService.runPipeline({
      nicheCode,
      input,
      triggeredBy: 'api:retry',
      dryRun: Boolean(dryRun),
      skipPublish: Boolean(skipPublish),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a post log record.
 */
async function deletePost(req, res, next) {
  try {
    const { id } = req.params;
    const post = await PostLog.findByPk(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Post log with id ${id} not found`,
          statusCode: 404,
        },
      });
    }

    await post.destroy();

    return res.json({
      success: true,
      message: 'Post log deleted successfully',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPosts,
  getPostById,
  createPost,
  retryPost,
  deletePost,
};
