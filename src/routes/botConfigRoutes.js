const express = require('express');
const botConfigController = require('../controllers/botConfigController');

const router = express.Router();

router.get('/', botConfigController.getBotConfigs);
router.put('/:nicheCode', botConfigController.updateBotConfig);

module.exports = router;
