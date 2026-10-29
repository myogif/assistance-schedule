const { BotConfig, Niche } = require('../models');

/**
 * Helper to mask sensitive Telegram bot tokens.
 * @param {string} token
 * @returns {string}
 */
function maskToken(token) {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Get bot configurations for all niches with masked tokens.
 */
async function getBotConfigs(req, res, next) {
  try {
    const configs = await BotConfig.findAll({
      include: [
        {
          model: Niche,
          as: 'niche',
          attributes: ['id', 'code', 'name', 'isActive'],
        },
      ],
      order: [['id', 'ASC']],
    });

    const sanitized = configs.map((cfg) => {
      const json = cfg.toJSON();
      return {
        ...json,
        botToken: maskToken(json.botToken),
        hasToken: Boolean(json.botToken),
      };
    });

    return res.json({
      success: true,
      data: sanitized,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update or create bot configuration for a specific niche.
 */
async function updateBotConfig(req, res, next) {
  try {
    const { nicheCode } = req.params;
    const niche = await Niche.findOne({ where: { code: nicheCode } });

    if (!niche) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Niche with code "${nicheCode}" not found`,
          statusCode: 404,
        },
      });
    }

    const {
      botToken,
      botUsername,
      allowedUsers,
      isActive,
    } = req.body;

    let config = await BotConfig.findOne({ where: { nicheId: niche.id } });

    if (!config) {
      if (!botToken) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'botToken is required to create a new bot configuration',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
          },
        });
      }

      config = await BotConfig.create({
        nicheId: niche.id,
        botToken,
        botUsername: botUsername || null,
        allowedUsers: allowedUsers || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
    } else {
      const updateData = {};
      // Only update botToken if a new unmasked token is provided
      if (botToken && !botToken.includes('...')) {
        updateData.botToken = botToken;
      }
      if (botUsername !== undefined) updateData.botUsername = botUsername;
      if (allowedUsers !== undefined) updateData.allowedUsers = allowedUsers;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      await config.update(updateData);
    }

    const json = config.toJSON();
    return res.json({
      success: true,
      data: {
        ...json,
        niche: {
          id: niche.id,
          code: niche.code,
          name: niche.name,
        },
        botToken: maskToken(json.botToken),
        hasToken: Boolean(json.botToken),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBotConfigs,
  updateBotConfig,
};
