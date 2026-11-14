const express = require('express');
const newsController = require('../controllers/newsController');

const router = express.Router();

router.post('/ingest', newsController.ingest);
router.post('/parse', newsController.parse);
router.get('/jobs/:id', newsController.getJob);
router.get('/clusters', newsController.getClusters);
router.get('/sources', newsController.getSources);
router.get('/status', newsController.getQueueStatus);

module.exports = router;
