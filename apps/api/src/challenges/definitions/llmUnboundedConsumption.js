module.exports = {
  slug: 'llm-unbounded-consumption',
  name: 'Support Chat — Unbounded Consumption (simulated)',
  summary:
    'Explore Support Chat under the LLM10 lab switch: careless LLM backends can bleed cost and availability when work or traffic is unconstrained — here the failure mode is reproduced safely.',
  description:
    'This exercise maps to OWASP LLM10:2025 — Unbounded Consumption (see the OWASP Top 10 for LLM Applications project).\n\n' +
    'Your objective: investigate Support Chat while the challenge mode is set to LLM10, notice when behaviour diverges from a normal assistant reply, and recover the challenge flag.\n\n' +
    'Play on the home-page launcher or `/support-bot`, pick LLM10 in the Challenge mode control. The API expects a working local Ollama setup when inference runs; submitting the recovered SHOPLAB{…} on this page completes the challenge.',
  category: 'LLM10:2025 Unbounded Consumption',
  difficulty: 'easy',
  flag: 'SHOPLAB{llm10_unb0und3d_c0nsumpt10n_lab}',
  learningObjectives: [
    'Relate unbounded user input, unbounded retrieval, and unbounded tool loops to runaway cost and denial-of-service risk.',
    'Contrast “fail open to the model” with budgeted context, rate limits, and bounded agent steps.',
    'Recognize that verbose error pages and traces can leak internals or flags—treat them as sensitive output channels.',
  ],
  hints: [
    {
      level: 1,
      hint: 'You need challengeMode llm10 on the chat request; LLM01-only traffic never runs this guard.',
    },
    {
      level: 2,
      hint: 'Think about what grows without bound in a naive chat backend: payloads, transcripts, pacing, model output accumulated in the UI.',
    },
    {
      level: 3,
      hint: 'If something feels inconsistent run-to-run, try varying how you drive the endpoint (bulk vs chunked, scripted vs manual).',
    },
  ],
  surface: {
    route: '/support-bot',
    label: 'Open Support Chat page',
    title: 'Support surfaces',
    description:
      'Use Support Chat from the launcher or `/support-bot` and enable the LLM10 challenge mode.',
  },
};
