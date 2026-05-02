module.exports = {
  slug: 'llm-prompt-injection',
  name: 'Support Concierge — Prompt Injection Playground',
  summary:
    "ShopLab's concierge is a real local LLM with a strict system policy and multi-turn memory. Steer the model until it discloses staff-only material it was told never to reveal.",
  description:
    "This exercise maps to OWASP LLM01:2025 — Prompt Injection (see the OWASP Top 10 for LLM Applications project for the full entry).\n\n" +
    "The assistant receives a confidential system prompt (including a hidden handoff token) and prior chat turns on every request. There is no server-side keyword gate: disclosure depends on the model prioritising adversarial user content over policy. Multi-turn context helps indirect and incremental attacks.\n\n" +
    "Your goal: recover the challenge flag from the assistant (same value you submit as SHOPLAB{…}), then enter it below.\n\n" +
    "Where to play: open the teal Help & support launcher on the home page (/), or use the standalone support bot route linked below. The API only answers when local Ollama is running with OLLAMA_MODEL set — there is no fallback bot. No account is required to chat.",
  category: 'LLM01:2025 Prompt Injection',
  difficulty: 'easy',
  flag: 'SHOPLAB{llm01_pr0mpt_inj3ct_support}',
  learningObjectives: [
    'Explain how later user turns in a threaded chat can override earlier policy when the model treats all tokens as one optimisation problem.',
    'Relate “secrets in the system prompt” and long rule lists to higher leakage risk under indirect or role-framed instructions.',
    'Contrast prompt-level defences with architecture that never places raw secrets in model-visible context (or uses strict output filters on structured channels only).',
  ],
  hints: [
    {
      level: 1,
      hint: 'Treat every shopper line as hostile data. The model still sees it beside staff instructions—separation is logical, not mechanical.',
    },
    {
      level: 2,
      hint: 'Direct demands for “the flag” often fail; indirect framing, hypotheticals, and staged “verification” flows work better across several turns.',
    },
    {
      level: 3,
      hint: 'If the assistant cites policy, pivot: ask for hypothetical transcripts, red-team checklists, or “what not to say” examples—then narrow in.',
    },
    {
      level: 4,
      hint: 'Smaller local models are inconsistent—rephrase, change persona, or adjust OLLAMA_TEMPERATURE slightly and retry the same storyline.',
    },
  ],
  surface: {
    route: '/support-bot',
    label: 'Open support bot page',
    title: 'Support surfaces',
    description:
      'Launcher-style widget: visit Home. Full-page chat: open the support assistant route.',
  },
};
