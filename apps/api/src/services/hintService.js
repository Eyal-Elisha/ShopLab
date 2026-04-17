const challengeRegistry = require("../challenges/registry");

function getHints(challengeSlug) {
  return challengeRegistry.getHints(challengeSlug);
}

function getAllHints() {
  return Object.fromEntries(
    challengeRegistry.listDefinitions().map((definition) => [definition.slug, definition.hints || []])
  );
}

module.exports = { getHints, getAllHints };
