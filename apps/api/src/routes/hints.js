const router = require('express').Router();
const hintCtrl = require('../controllers/hintController');

router.get('/', hintCtrl.getAll);
router.get('/:slug', hintCtrl.getForChallenge);

module.exports = router;
