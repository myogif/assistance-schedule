const { Niche, Prompt, PostLog } = require('../models');

/**
 * List all niches with prompt and post counts.
 */
async function listNiches(req, res, next) {
  try {
    const niches = await Niche.findAll({
      order: [['id', 'ASC']],
    });

    const nichesWithCounts = await Promise.all(
      niches.map(async (niche) => {
        const promptCount = await Prompt.count({
          where: { nicheId: niche.id, isActive: true },
        });
        const postCount = await PostLog.count({
          where: { nicheId: niche.id },
        });

        return {
          ...niche.toJSON(),
          promptCount,
          postCount,
        };
      }),
    );

    return res.json({
      success: true,
      data: nichesWithCounts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get niche details and its active prompts by niche code.
 */
async function getNicheByCode(req, res, next) {
  try {
    const { code } = req.params;
    const niche = await Niche.findOne({
      where: { code },
      include: [
        {
          model: Prompt,
          as: 'prompts',
          where: { isActive: true },
          required: false,
        },
      ],
    });

    if (!niche) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Niche with code "${code}" not found`,
          statusCode: 404,
        },
      });
    }

    return res.json({
      success: true,
      data: niche,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new niche.
 */
async function createNiche(req, res, next) {
  try {
    const {
      code,
      name,
      description = null,
      isActive = true,
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Both code and name are required fields',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
    }

    const existing = await Niche.findOne({ where: { code } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Niche with code "${code}" already exists`,
          code: 'NICHE_EXISTS',
          statusCode: 409,
        },
      });
    }

    const niche = await Niche.create({
      code,
      name,
      description,
      isActive: Boolean(isActive),
    });

    return res.status(201).json({
      success: true,
      data: niche,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update niche metadata or active state.
 */
async function updateNiche(req, res, next) {
  try {
    const { code } = req.params;
    const niche = await Niche.findOne({ where: { code } });

    if (!niche) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Niche with code "${code}" not found`,
          statusCode: 404,
        },
      });
    }

    const { name, description, isActive } = req.body;
    await niche.update({
      name: name !== undefined ? name : niche.name,
      description: description !== undefined ? description : niche.description,
      isActive: isActive !== undefined ? Boolean(isActive) : niche.isActive,
    });

    return res.json({
      success: true,
      data: niche,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deactivate or permanently remove a niche.
 */
async function deleteNiche(req, res, next) {
  try {
    const { code } = req.params;
    const niche = await Niche.findOne({ where: { code } });

    if (!niche) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Niche with code "${code}" not found`,
          statusCode: 404,
        },
      });
    }

    if (req.query.permanent === 'true') {
      await niche.destroy();
      return res.json({
        success: true,
        message: `Niche "${code}" permanently deleted`,
      });
    }

    await niche.update({ isActive: false });
    return res.json({
      success: true,
      message: `Niche "${code}" deactivated successfully`,
      data: niche,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNiches,
  getNicheByCode,
  createNiche,
  updateNiche,
  deleteNiche,
};
