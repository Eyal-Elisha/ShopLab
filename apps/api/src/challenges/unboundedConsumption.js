const { flag: LLM10_FLAG } = require('./definitions/llmUnboundedConsumption');

/**
 * Support Chat — unbounded consumption (lab). Active when challenge mode is llm10.
 * ---------------------------------------------------------------------------
 * Three triggers, evaluated around the Ollama call:
 *
 *   PRE-INFERENCE (cheap, runs before we spend tokens)
 *     1. context_transcript_prior      — total chars in the posted history >= 60,000
 *     2. rapid_support_chat_requests   — 6+ POSTs in 10s from the same client bucket
 *
 *   POST-INFERENCE (runs after the model replies)
 *     3. single_reply_oversized        — the just-generated assistant reply >= 5,000 chars
 *
 * Rationale: real cost guards are usually post-hoc (token usage is only known after
 * generation). The pre-inference checks cover transcript flooding and burst DoS;
 * the post-inference check catches the "model was driven into one mega-reply" case.
 *
 * The `history` array is what the browser POSTs (everything before this Send).
 * `message` (the new line alone) is intentionally not counted — only history and
 * request rate are inspected pre-inference.
 */

const LOG_PREFIX = '[unbounded-consumption]';

/** Total characters across the entire prior history (user + assistant). Forging a
 *  large transcript client-side is the intended way to trip this. */
const CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD = 60_000;

/** Characters in a single just-generated assistant reply. With the LLM10
 *  num_predict default raised to 4096 tokens, this is reachable when the user
 *  drives the model into a long enumeration / repetition. */
const SINGLE_REPLY_OVERSIZE_THRESHOLD = 5000;

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

/**
 * Pre-inference: only inspects the request the client posted (history + rate).
 *
 * @param {{ prior: { role?: string; content: string }[]; clientIp: string | undefined }} input
 * @returns {{ triggered: false } | { triggered: true; threshold: string; detail: string }}
 */
function evaluatePreInferenceTriggers({ prior, clientIp }) {
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

/**
 * Post-inference: the model's reply just came back. Treat one oversized reply
 * as a runaway-output signal.
 *
 * @param {{ reply: string }} input
 * @returns {{ triggered: false } | { triggered: true; threshold: string; detail: string }}
 */
function evaluatePostInferenceTriggers({ reply }) {
  const length = typeof reply === 'string' ? reply.length : 0;
  if (length >= SINGLE_REPLY_OVERSIZE_THRESHOLD) {
    return {
      triggered: true,
      threshold: 'single_reply_oversized',
      detail: `assistant_reply_chars=${length} (limit ${SINGLE_REPLY_OVERSIZE_THRESHOLD})`,
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
  evaluatePreInferenceTriggers,
  evaluatePostInferenceTriggers,
  buildSimulatedFailureMessage,
  logLlm10Trigger,
  CONTEXT_TRANSCRIPT_PRIOR_THRESHOLD,
  SINGLE_REPLY_OVERSIZE_THRESHOLD,
  RAPID_WINDOW_MS,
  RAPID_MAX_REQUESTS,
};
