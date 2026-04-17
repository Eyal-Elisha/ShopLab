const router = require('express').Router();
const authCtrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { registerRules, loginRules, validate } = require('../middleware/validation');

router.post('/register', registerRules, validate, authCtrl.register);
router.post('/login', loginRules, validate, authCtrl.login);
router.post('/logout', authCtrl.logout);
router.get('/profile', authenticate, authCtrl.getProfile);

module.exports = router;
