const router = require('express').Router();
const accountCtrl = require('../controllers/accountController');
const { authenticate } = require('../middleware/auth');

router.patch('/settings', authenticate, accountCtrl.updateSettings);

module.exports = router;
