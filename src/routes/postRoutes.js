const express = require('express');
const postController = require('../controllers/postController');
const { validateBody } = require('../middlewares/validator');

const router = express.Router();

router.get('/', postController.listPosts);
router.get('/:id', postController.getPostById);
router.post('/', validateBody(['input']), postController.createPost);
router.post('/:id/retry', postController.retryPost);
router.delete('/:id', postController.deletePost);

module.exports = router;
