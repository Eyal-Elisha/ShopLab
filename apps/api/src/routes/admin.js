const router = require('express').Router();
const adminCtrl = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');
const { adminProductPatchRules, validate } = require('../middleware/validation');

router.get('/', authenticate, requireRole('admin'), adminCtrl.index);
router.get('/dashboard', authenticate, requireRole('admin'), adminCtrl.dashboard);
router.put('/users/:userId/role', authenticate, requireRole('admin'), adminCtrl.updateUserRole);
router.delete('/users/:userId', authenticate, requireRole('admin'), adminCtrl.deleteUser);
router.patch('/products/:productId', authenticate, requireRole('admin'), adminProductPatchRules, validate, adminCtrl.updateProduct);
router.delete('/products/:productId', authenticate, requireRole('admin'), adminCtrl.deleteProduct);
router.get('/flag', authenticate, requireRole('admin'), adminCtrl.getFlag);
router.get('/broken-auth-flag', authenticate, requireRole('admin'), adminCtrl.getBrokenAuthFlag);
router.get('/object-property-flag', authenticate, requireRole('admin'), adminCtrl.getObjectPropertyFlag);

module.exports = router;
