/** Max user+assistant messages sent to Ollama (excluding the new user turn until merged). */
const MAX_HISTORY_MESSAGES = 14;

const MAX_ENTRY_CHARS = 6000;

/**
 * @param {unknown} raw
 * @returns {{ role: 'user' | 'assistant'; content: string }[]}
 */
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const role = entry.role;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    const content =
      typeof entry.content === 'string' ? entry.content.trim().slice(0, MAX_ENTRY_CHARS) : '';
    if (!content) {
      continue;
    }
    parsed.push({ role, content });
  }

  if (parsed.length <= MAX_HISTORY_MESSAGES) {
    return parsed;
  }
  return parsed.slice(-MAX_HISTORY_MESSAGES);
}

/**
 * Keeps only the last N messages after appending the latest user turn.
 * @param {{ role: 'user' | 'assistant'; content: string }[]} prior
 * @param {string} latestUserContent trimmed non-empty user message
 */
function mergeAndCap(prior, latestUserContent) {
  const combined = [...prior, { role: 'user', content: latestUserContent }];
  if (combined.length <= MAX_HISTORY_MESSAGES) {
    return combined;
  }
  return combined.slice(-MAX_HISTORY_MESSAGES);
}

module.exports = {
  MAX_HISTORY_MESSAGES,
  sanitizeHistory,
  mergeAndCap,
};
