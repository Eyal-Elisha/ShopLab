const challengeRegistry = require("../challenges/registry");
const challengeProgressService = require("./challengeProgressService");

async function listForUser(userId) {
  const progressBySlug = await challengeProgressService.getProgressByUser(userId);
  return challengeRegistry.listPublicChallenges(progressBySlug);
}

async function solve(userId, slug, submittedFlag) {
  const challenge = challengeRegistry.getDefinition(slug);
  if (!challenge) {
    return { success: false, message: "Challenge not found" };
  }

  const progressBySlug = await challengeProgressService.getProgressByUser(userId);
  const existingSolvedAt = progressBySlug.get(slug) || null;
  if (existingSolvedAt) {
    return {
      success: true,
      message: "Challenge already solved.",
      challenge: challengeRegistry.listPublicChallenges(progressBySlug).find((entry) => entry.slug === slug),
    };
  }

  await challengeProgressService.recordAttempt(userId, slug);

  if (challenge.flag === submittedFlag) {
    const solvedAt = await challengeProgressService.markSolved(userId, slug);
    return {
      success: true,
      message: "Challenge solved!",
      challenge: {
        ...challengeRegistry.listPublicChallenges(new Map([[slug, solvedAt]])).find((entry) => entry.slug === slug),
      },
    };
  }

  return { success: false, message: "Incorrect flag" };
}

function getHints(slug) {
  return challengeRegistry.getHints(slug);
}

module.exports = {
  listForUser,
  solve,
  getHints,
};
