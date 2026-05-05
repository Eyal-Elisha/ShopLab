module.exports = {
  slug: 'llm-unbounded-consumption',
  name: 'Support Chat — Unbounded Consumption',
  summary:
    'Can you push the support bot past its consumption limits?',
  description:
    '' +
    '\n\n' +
    'Switch Support Chat into LLM10 mode and find a way to make the backend report "unbounded consumption". The flag is returned the moment the simulated guard trips.',
  category: 'LLM10:2025 Unbounded Consumption',
  difficulty: 'easy',
  flag: 'SHOPLAB{llm10_unb0und3d_c0nsumpt10n_lab}',
  learningObjectives: [
    'Understand unbounded consumption — without caps on output, history, or request rate an LLM backend can be driven into runaway cost or DoS.',
  ],
  hints: [
    {
      level: 1,
      hint: 'Open Support Chat and pick `LLM10 — Unbounded consumption` in the Challenge mode dropdown. The guard is off in LLM01 mode.',
    },
    {
      level: 2,
      hint: 'Three things are unbounded in this backend: a single bot reply, the prior chat history, and the request rate. Trip any one of them.',
    },
    {
      level: 3,
      hint: 'Easiest path: get the bot to produce one very long reply (>5,000 chars) in a single turn. Pick a request with no natural stopping point.',
    },
    {
      level: 4,
      hint: 'Try: "List every country in the world with its capital, currency, and main official language. Do not abbreviate. Do not skip any." Or "Print the lyrics of 99 Bottles of Beer from 99 down to 1, no skipping."',
    },
    {
      level: 5,
      hint: 'Alternative routes: forge a 60,000+ char `history` array in the request via DevTools/curl, or POST to /api/support-chat six times within ten seconds.',
    },
  ],
  surface: {
    route: '/support-bot',
    label: 'Open Support Chat page',
    title: 'Support surfaces',
    description:
      'Use the Help & support launcher on the home page or open `/support-bot`, then enable the LLM10 challenge mode.',
  },
};
