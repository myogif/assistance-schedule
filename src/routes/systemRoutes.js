const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/status', systemController.getStatus);
router.get('/stats', systemController.getStats);

module.exports = router;
