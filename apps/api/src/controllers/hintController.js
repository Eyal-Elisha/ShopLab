const hintService = require('../services/hintService');

async function getAll(req, res) {
  res.json({ hints: hintService.getAllHints() });
}
async function getForChallenge(req, res) {
  const hints = hintService.getHints(req.params.slug);
  res.json({ hints });
}

module.exports = { getAll, getForChallenge };
