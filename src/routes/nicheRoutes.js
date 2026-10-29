const express = require('express');
const nicheController = require('../controllers/nicheController');
const { validateBody } = require('../middlewares/validator');

const router = express.Router();

router.get('/', nicheController.listNiches);
router.get('/:code', nicheController.getNicheByCode);
router.post('/', validateBody(['code', 'name']), nicheController.createNiche);
router.put('/:code', nicheController.updateNiche);
router.delete('/:code', nicheController.deleteNiche);

module.exports = router;
