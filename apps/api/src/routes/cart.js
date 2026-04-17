const router = require('express').Router();
const cartCtrl = require('../controllers/cartController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, cartCtrl.getCart);
router.post('/', authenticate, cartCtrl.addItem);
router.put('/:productId', authenticate, cartCtrl.updateItem);
router.delete('/:productId', authenticate, cartCtrl.removeItem);

module.exports = router;
