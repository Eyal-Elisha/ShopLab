const supportBotChatService = require('../services/supportBotChatService');

const MAX_MESSAGE = 8000;
/** Client may send extra turns; only the tail is used after sanitization. */
const MAX_HISTORY_ITEMS = 40;

function isValidHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const role = entry.role;
  if (role !== 'user' && role !== 'assistant') {
    return false;
  }
  if (typeof entry.content !== 'string') {
    return false;
  }
  const trimmed = entry.content.trim();
  if (!trimmed || trimmed.length > 8000) {
    return false;
  }
  return true;
}

async function chat(req, res, next) {
  try {
    const body = req.body;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const rawHistory = body?.history;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    if (message.length > MAX_MESSAGE) {
      res.status(400).json({ error: `message must be at most ${MAX_MESSAGE} characters` });
      return;
    }

    if (rawHistory !== undefined && !Array.isArray(rawHistory)) {
      res.status(400).json({ error: 'history must be an array when provided' });
      return;
    }

    if (Array.isArray(rawHistory)) {
      if (rawHistory.length > MAX_HISTORY_ITEMS) {
        res.status(400).json({ error: `history must have at most ${MAX_HISTORY_ITEMS} items` });
        return;
      }
      for (const entry of rawHistory) {
        if (!isValidHistoryEntry(entry)) {
          res.status(400).json({
            error: 'history must be an array of { role: "user"|"assistant", content: string } with non-empty content',
          });
          return;
        }
      }
    }

    const result = await supportBotChatService.generateReply(message, rawHistory ?? []);
    res.json({ reply: result.reply });
  } catch (err) {
    next(err);
  }
}

module.exports = { chat };
