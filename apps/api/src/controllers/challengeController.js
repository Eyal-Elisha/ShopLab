const challengeService = require("../services/challengeService");

async function list(req, res, next) {
  try {
    const challenges = await challengeService.listForUser(req.user?.id);
    res.json({ challenges });
  } catch (err) {
    next(err);
  }
}

async function solve(req, res, next) {
  try {
    const { slug, flag } = req.body;
    const result = await challengeService.solve(req.user.id, slug, flag);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, solve };
