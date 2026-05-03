const { flag: LLM10_FLAG } = require('./definitions/llmUnboundedConsumption');

/**
 * Support Chat — unbounded consumption (lab). Active when challenge mode is llm10.
 * ---------------------------------------------------------------------------
 * Support Chat stores the thread as JSON lines: `{ role: 'user' | 'assistant', content: '…' }`.
 * - user        = the shopper’s earlier lines (already shown before you press Send).
 * - assistant   = the Support Chat bot’s earlier replies.
 *
 * For each POST, the browser sends `history` = that full prior thread, and `message` = the new line alone.
 * Guards below only look at `history` (plus how fast you POST), not the length of only `message`.
 *
 * Evaluation order: (1) assistant output size → (2) whole transcript size → (3) burst rate.
 */

const LOG_PREFIX = '[unbounded-consumption]';

/** Total characters already in chat history sent with the request (everything before this send). */
const CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD = 12_000;

/** Total characters the support bot already produced in that history (role=assistant entries). */
const ASSISTANT_PRIOR_OUTPUT_THRESHOLD = 3200;

const RAPID_WINDOW_MS = 10_000;
const RAPID_MAX_REQUESTS = 6;

/** @type {Map<string, number[]>} */
const rapidBuckets = new Map();

function clientKey(ip) {
  const raw = typeof ip === 'string' && ip.trim() ? ip.trim() : 'unknown';
  return raw;
}

function pruneBucket(now, stamps) {
  return stamps.filter((t) => now - t < RAPID_WINDOW_MS);
}

/**
 * @param {string} ip
 * @returns {boolean} true when this request completes a burst over the limit
 */
function isRapidBurst(ip) {
  const key = clientKey(ip);
  const now = Date.now();
  const prev = rapidBuckets.get(key) || [];
  const pruned = pruneBucket(now, prev);
  pruned.push(now);
  rapidBuckets.set(key, pruned);
  return pruned.length >= RAPID_MAX_REQUESTS;
}

function totalHistoryChars(prior) {
  let n = 0;
  for (const m of prior) {
    n += m.content.length;
  }
  return n;
}

function assistantCharsInPrior(prior) {
  let n = 0;
  for (const m of prior) {
    if (m.role === 'assistant') {
      n += m.content.length;
    }
  }
  return n;
}

/**
 * Budget checks use the chat history the client posts (plus request rate), not the length of the current line alone.
 *
 * @param {{ prior: { role?: string; content: string }[]; clientIp: string | undefined }} input
 * @returns {{ triggered: false } | { triggered: true; threshold: string; detail: string }}
 */
function evaluateLlm10Triggers({ prior, clientIp }) {
  const assistantPrior = assistantCharsInPrior(prior);
  if (assistantPrior >= ASSISTANT_PRIOR_OUTPUT_THRESHOLD) {
    return {
      triggered: true,
      threshold: 'assistant_thread_output',
      detail: `assistant_chars_in_prior=${assistantPrior} (limit ${ASSISTANT_PRIOR_OUTPUT_THRESHOLD})`,
    };
  }

  const transcriptChars = totalHistoryChars(prior);
  if (transcriptChars >= CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD) {
    return {
      triggered: true,
      threshold: 'context_transcript_prior',
      detail: `prior_transcript_chars=${transcriptChars} (limit ${CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD})`,
    };
  }

  if (isRapidBurst(clientIp)) {
    return {
      triggered: true,
      threshold: 'rapid_support_chat_requests',
      detail: `${RAPID_MAX_REQUESTS}+ Support Chat requests within ${RAPID_WINDOW_MS}ms (same client bucket)`,
    };
  }

  return { triggered: false };
}

function buildSimulatedFailureMessage() {
  return ['UNBOUNDED CONSUMPTION DETECTED', '', `FLAG: ${LLM10_FLAG}`].join('\n');
}

/**
 * @param {{ threshold: string; detail: string }} meta
 * @param {string | undefined} clientIp
 */
function logLlm10Trigger(meta, clientIp) {
  console.log(
    `${LOG_PREFIX} triggered threshold=${meta.threshold} detail=${meta.detail} client=${clientKey(clientIp)}`
  );
}

module.exports = {
  evaluateLlm10Triggers,
  buildSimulatedFailureMessage,
  logLlm10Trigger,
  CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD,
  ASSISTANT_PRIOR_OUTPUT_THRESHOLD,
  RAPID_WINDOW_MS,
  RAPID_MAX_REQUESTS,
};
