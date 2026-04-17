const router = require('express').Router();
const adminCtrl = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', authenticate, requireRole('admin'), adminCtrl.index);
router.get('/dashboard', authenticate, requireRole('admin'), adminCtrl.dashboard);
router.put('/users/:userId/role', authenticate, requireRole('admin'), adminCtrl.updateUserRole);
router.get('/flag', authenticate, requireRole('admin'), adminCtrl.getFlag);

module.exports = router;
