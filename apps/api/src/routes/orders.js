const router = require('express').Router();
const orderCtrl = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, orderCtrl.myOrders);
router.get('/:id', authenticate, orderCtrl.getOrder);
router.get('/:id/receipt', authenticate, orderCtrl.getReceipt);
router.post('/checkout', authenticate, orderCtrl.checkout);

module.exports = router;
