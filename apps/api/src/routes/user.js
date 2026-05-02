const router = require('express').Router();
const userCtrl = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { validate, userProfileRules, passwordRules } = require('../middleware/validation');

router.get('/me', authenticate, userCtrl.getMe);
router.put('/me', authenticate, userProfileRules, validate, userCtrl.updateMe);
router.put('/me/password', authenticate, passwordRules, validate, userCtrl.updatePassword);
router.get('/me/preferences', authenticate, userCtrl.getPreferences);
router.post('/me/preferences', authenticate, userCtrl.setPreferences);
router.get('/me/vip', authenticate, userCtrl.getVipFlag);

module.exports = router;
