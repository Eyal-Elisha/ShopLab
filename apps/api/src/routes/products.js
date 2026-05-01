const router = require('express').Router();
const productCtrl = require('../controllers/productController');
const reviewCtrl = require('../controllers/reviewController');
const { authenticate, requireRole } = require('../middleware/auth');
const { productRules, productPatchRules, reviewRules, searchRules, validate } = require('../middleware/validation');

// Public
router.get('/', productCtrl.list);
router.get('/categories', productCtrl.categories);
router.get('/search', searchRules, validate, productCtrl.search);
router.get('/:id', productCtrl.getOne);

// Reviews (public read, auth write)
router.get('/:productId/reviews', reviewCtrl.getReviews);
router.post('/:productId/reviews', authenticate, reviewRules, validate, reviewCtrl.createReview);
router.delete('/reviews/:id', authenticate, reviewCtrl.deleteReview);

// Admin only
router.post('/', authenticate, requireRole('admin'), productRules, validate, productCtrl.create);
router.put('/:id', authenticate, productPatchRules, validate, productCtrl.update);
router.delete('/:id', authenticate, requireRole('admin'), productCtrl.remove);

module.exports = router;
