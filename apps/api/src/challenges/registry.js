const brokenAccessControlDef = require('./definitions/brokenAccessControl');
const profileBolaDef = require('./definitions/profileBola');
const bflaEvalDef = require('./definitions/bflaEval');
const llmPromptInjectionDef = require('./definitions/llmPromptInjection');
const rememberMeBrokenAuthDef = require('./definitions/rememberMeBrokenAuth');

/**
 * Register challenges here.
 */
const registeredChallenges = [
  { definition: brokenAccessControlDef },
  { definition: profileBolaDef },
  { definition: bflaEvalDef },
  { definition: llmPromptInjectionDef },
  { definition: rememberMeBrokenAuthDef },
];

const definitions = registeredChallenges.map((entry) => entry.definition);

const difficultyRank = {
  easy: 1,
  medium: 2,
  hard: 3,
};

function sortChallenges(a, b) {
  return (
    (difficultyRank[a.difficulty] || 99) - (difficultyRank[b.difficulty] || 99) ||
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name)
  );
}

function createPublicChallenge(definition, solvedAt = null) {
  return {
    id: definition.slug,
    slug: definition.slug,
    name: definition.name,
    summary: definition.summary,
    description: definition.description,
    category: definition.category,
    difficulty: definition.difficulty,
    learningObjectives: definition.learningObjectives,
    panel: definition.panel || null,
    surface: definition.surface || null,
    solved: Boolean(solvedAt),
    solvedAt,
  };
}

function listDefinitions() {
  return [...definitions].sort(sortChallenges);
}

function getDefinition(slug) {
  return definitions.find((definition) => definition.slug === slug) || null;
}

function listPublicChallenges(progressBySlug = new Map()) {
  return listDefinitions().map((definition) =>
    createPublicChallenge(definition, progressBySlug.get(definition.slug) || null)
  );
}

function getHints(slug) {
  return getDefinition(slug)?.hints || [];
}

module.exports = {
  listDefinitions,
  listPublicChallenges,
  getDefinition,
  getHints,
};
