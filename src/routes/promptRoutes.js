const express = require('express');
const promptController = require('../controllers/promptController');

const router = express.Router();

router.get('/:nicheCode/prompts', promptController.listPrompts);
router.get('/:nicheCode/prompts/:type', promptController.getPrompt);
router.put('/:nicheCode/prompts/:type', promptController.updatePrompt);
router.post('/:nicheCode/prompts/:type/reset', promptController.resetPrompt);
router.post('/:nicheCode/prompts/test', promptController.testPrompt);

module.exports = router;
