const express = require('express');
const postRoutes = require('./postRoutes');
const nicheRoutes = require('./nicheRoutes');
const promptRoutes = require('./promptRoutes');
const systemRoutes = require('./systemRoutes');
const botConfigRoutes = require('./botConfigRoutes');

const router = express.Router();

router.use('/posts', postRoutes);
router.use('/niches', promptRoutes);
router.use('/niches', nicheRoutes);
router.use('/system', systemRoutes);
router.use('/bot-configs', botConfigRoutes);

module.exports = router;
