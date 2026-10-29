const { Op } = require('sequelize');
const { sequelize, PostLog, Niche } = require('../models');

/**
 * Get system health and configuration status.
 */
async function getStatus(req, res, next) {
  try {
    let dbStatus = 'connected';
    try {
      await sequelize.authenticate();
    } catch (err) {
      dbStatus = `disconnected: ${err.message}`;
    }

    return res.json({
      success: true,
      data: {
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        database: dbStatus,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        zernioConfigured: Boolean(process.env.ZERNIO_API_KEY),
        activeNiche: process.env.ACTIVE_NICHE || 'finance',
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get aggregate system and post statistics.
 */
async function getStats(req, res, next) {
  try {
    const totalPosts = await PostLog.count();
    const publishedPosts = await PostLog.count({ where: { status: 'published' } });
    const failedPosts = await PostLog.count({ where: { status: 'failed' } });
    const pendingPosts = await PostLog.count({
      where: {
        status: {
          [Op.in]: ['pending', 'extracting', 'generating', 'ready'],
        },
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const postsToday = await PostLog.count({
      where: {
        createdAt: {
          [Op.gte]: startOfToday,
        },
      },
    });

    const niches = await Niche.findAll({ attributes: ['id', 'code', 'name'] });
    const byNiche = await Promise.all(
      niches.map(async (niche) => {
        const total = await PostLog.count({ where: { nicheId: niche.id } });
        const published = await PostLog.count({
          where: { nicheId: niche.id, status: 'published' },
        });

        return {
          code: niche.code,
          name: niche.name,
          total,
          published,
        };
      }),
    );

    return res.json({
      success: true,
      data: {
        totalPosts,
        publishedPosts,
        failedPosts,
        pendingPosts,
        postsToday,
        byNiche,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  getStats,
};
