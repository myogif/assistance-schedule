const db = require('./models');
const scraper = require('./services/scraper');
const promptService = require('./services/promptService');
const aiExtractor = require('./services/aiExtractor');
const imageGenerator = require('./services/imageGenerator');
const zernioPublisher = require('./services/zernioPublisher');
const pipelineService = require('./services/pipelineService');
const app = require('./app');
const swaggerSpec = require('./docs/swagger');
const postController = require('./controllers/postController');
const nicheController = require('./controllers/nicheController');
const promptController = require('./controllers/promptController');
const systemController = require('./controllers/systemController');
const botConfigController = require('./controllers/botConfigController');

const controllers = {
  postController,
  nicheController,
  promptController,
  systemController,
  botConfigController,
};

module.exports = {
  app,
  db,
  ...db,
  scraper,
  promptService,
  aiExtractor,
  imageGenerator,
  zernioPublisher,
  pipelineService,
  runPipeline: pipelineService.runPipeline,
  controllers,
  ...controllers,
  swaggerSpec,
};
