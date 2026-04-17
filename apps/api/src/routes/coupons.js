const router = require('express').Router();
const couponCtrl = require('../controllers/couponController');
const { authenticate } = require('../middleware/auth');

// VULNERABILITY: only authenticate — no requireRole('admin') or requireRole('staff')
router.post('/apply', authenticate, couponCtrl.apply);

module.exports = router;
