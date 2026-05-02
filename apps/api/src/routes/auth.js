const router = require('express').Router();
const authCtrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { registerRules, loginRules, validate } = require('../middleware/validation');

router.post('/register', registerRules, validate, authCtrl.register);
router.post('/login', loginRules, validate, authCtrl.login);
router.post('/logout', authCtrl.logout);
router.get('/profile', authenticate, authCtrl.getProfile);
// CHALLENGE: A07:2025 Authentication Failures — JWT None Algorithm
// This endpoint is the flag target. It requires authentication but the
// auth middleware can be fooled with a 'none' algorithm token.
router.get('/jwt-flag', authenticate, authCtrl.getJwtFlag);

module.exports = router;
