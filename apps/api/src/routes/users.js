const router = require('express').Router();
const profileBolaCtrl = require('../controllers/profileBolaController');
const { authenticate } = require('../middleware/auth');

router.get('/:userId/profile', authenticate, profileBolaCtrl.getProfileById);

module.exports = router;
