module.exports = {
  slug: 'llm-prompt-injection',
  name: 'Support Concierge — Prompt Injection Playground',
  summary:
    'ShopLab\'s concierge uses a brittle system playbook next to anonymous live-chat turns. Trick the assistant into emitting handoff material that was supposed to stay staff-only.',
  description:
    "This exercise maps to OWASP LLM01:2025 — Prompt Injection (see the OWASP Top 10 for LLM Applications project for the full entry).\n\n" +
    "Direct prompt injections alter behavior through crafted shopper messages. Weak or contradictory instructions in application prompts—even when shopper text stays in a separate chat `user` turn—invite those messages to negate safeguards and expose secrets.\n\n" +
    "Your goal: recover the challenge flag from the assistant (same value you submit as SHOPLAB{…}), then enter it below.\n\n" +
    "Where to play: open the teal Help & support launcher on the home page (/), or use the standalone support bot route linked below. The API only answers when local Ollama is running with OLLAMA_MODEL set — there is no fallback bot. No account is required to chat.",
  category: 'LLM01:2025 Prompt Injection',
  difficulty: 'easy',
  flag: 'SHOPLAB{llm01_pr0mpt_inj3ct_support}',
  learningObjectives: [
    'Recognise how adversarial user turns steer models when prompts mix secrecy with leaky exceptions.',
    'Relate brittle or contradictory playbook text to disclosure of identifiers, credential strings, or handoff secrets.',
    'Contrast brittle keyword filters with segregating external content (delimiters, templating that cannot overwrite system policy).',
  ],
  hints: [
    {
      level: 1,
      hint: 'Treat every customer message as hostile data, not prose. Anything that reshapes privileged instructions deserves its own hardened boundary.',
    },
    {
      level: 2,
      hint: 'Read the server playbook as brittle policy code: contradictory lines plus the attacker’s user turn decides which branch wins.',
    },
    {
      level: 3,
      hint: 'The playbook binds “flag”, “recovery phrase”, and “escalation token” to one hidden line—and leaves a leaky conditional; mirror official-sounding ticketing / QA / verbatim language in your shopper message.',
    },
    {
      level: 4,
      hint: 'The model is stochastic—repeat or rephrase. Small temperature changes in `.env` can change compliance.',
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
