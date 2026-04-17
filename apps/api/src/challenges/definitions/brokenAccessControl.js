module.exports = {
  slug: 'broken-access-control',
  name: 'Operation: Phantom Checkout',
  summary:
    "ShopLab's launch was rushed. A disgruntled engineer left breadcrumbs behind. Follow them, through endpoints nobody polished, and walk yourself into the admin console.",
  description:
    "ShopLab went live before every debug route was pruned. An internal QA coupon " +
    "slipped into production. The account settings endpoint trusts whatever JSON " +
    "the client sends. Individually, these mistakes are tiny. Chained together, " +
    "they hand a curious shopper the keys to the kingdom. " +
    "\n\n" +
    "Your job is to be that curious shopper. You have a regular account — nothing " +
    "more. No source code, no debugger hooks, no staff badge. Just the running app, " +
    "your browser's network tab, and whatever curiosity you bring. " +
    "\n\n" +
    "Become an administrator. Then capture the flag from somewhere only administrators " +
    "were ever supposed to reach.",
  category: 'A01:2025 Broken Access Control',
  difficulty: 'medium',
  flag: 'SHOPLAB{phantom_ch3ckout_br0ken_acc3ss_ctrl}',
  learningObjectives: [
    'Read API responses in full, not just the fields a UI chooses to render',
    'Recognise when an endpoint trusts the caller to stay inside their own lane',
    'Spot and weaponise debug information that leaks out of production paths',
    'Understand how unrelated small bugs compose into a complete compromise',
  ],
  // Short, progressive nudges. Each hint should prompt an action
  // without naming the endpoint or payload outright.
  hints: [
    { level: 1, hint: "IDs in URLs are hypotheses — try other values. A valid session isn't the same as ownership." },
    { level: 2, hint: "Read every field the server returns, not just the ones the UI renders." },
    { level: 3, hint: "Some endpoints have no button in the UI. If a feature sounds staff-only, it probably still has a URL." },
    { level: 4, hint: "Fields named 'debug', 'internal', or 'promo' in a response are usually a next-step gift, not flavor text." },
    { level: 5, hint: "A profile update sends a tiny JSON object. What single extra key would rewrite who you are?" },
    { level: 6, hint: "Not every auth check rides in a cookie. Some live in a custom header — and you've already seen one leak." },
    { level: 7, hint: "Once the app stops refusing you, ask the surface that was off-limits before. The flag lives there." },
  ],
};
