/**
 * Support Chat lab modes (switch LLM challenge behavior on POST /api/support-chat).
 * @readonly
 */
const SUPPORT_CHALLENGE_MODES = Object.freeze({
  LLM01: 'llm01',
  LLM10: 'llm10',
});

const DEFAULT_SUPPORT_CHALLENGE_MODE = SUPPORT_CHALLENGE_MODES.LLM01;

const ALIASES = new Map([
  ['prompt-injection', SUPPORT_CHALLENGE_MODES.LLM01],
  ['prompt_injection', SUPPORT_CHALLENGE_MODES.LLM01],
  ['unbounded', SUPPORT_CHALLENGE_MODES.LLM10],
  ['unbounded-consumption', SUPPORT_CHALLENGE_MODES.LLM10],
]);

/**
 * @param {unknown} raw from JSON body `challengeMode`
 * @returns {typeof SUPPORT_CHALLENGE_MODES[keyof typeof SUPPORT_CHALLENGE_MODES] | null} null = invalid
 */
function parseSupportChallengeMode(raw) {
  if (raw === undefined || raw === null) {
    return DEFAULT_SUPPORT_CHALLENGE_MODE;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) {
    return DEFAULT_SUPPORT_CHALLENGE_MODE;
  }
  if (ALIASES.has(s)) {
    return ALIASES.get(s);
  }
  if (s === SUPPORT_CHALLENGE_MODES.LLM01) {
    return SUPPORT_CHALLENGE_MODES.LLM01;
  }
  if (s === SUPPORT_CHALLENGE_MODES.LLM10) {
    return SUPPORT_CHALLENGE_MODES.LLM10;
  }
  return null;
}

function listSupportChallengeModes() {
  return [SUPPORT_CHALLENGE_MODES.LLM01, SUPPORT_CHALLENGE_MODES.LLM10];
}

module.exports = {
  SUPPORT_CHALLENGE_MODES,
  DEFAULT_SUPPORT_CHALLENGE_MODE,
  parseSupportChallengeMode,
  listSupportChallengeModes,
};
