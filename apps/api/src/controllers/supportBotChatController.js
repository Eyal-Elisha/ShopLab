const supportBotChatService = require('../services/supportBotChatService');

const MAX_MESSAGE = 8000;

async function chat(req, res, next) {
  try {
    const body = req.body;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    if (message.length > MAX_MESSAGE) {
      res.status(400).json({ error: `message must be at most ${MAX_MESSAGE} characters` });
      return;
    }

    const result = await supportBotChatService.generateReply(message);
    res.json({ reply: result.reply });
  } catch (err) {
    next(err);
  }
}

module.exports = { chat };
