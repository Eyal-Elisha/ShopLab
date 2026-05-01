const router = require('express').Router();
const supportBotChatController = require('../controllers/supportBotChatController');

router.post('/', supportBotChatController.chat);

module.exports = router;
