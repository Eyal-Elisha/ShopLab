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
    "Your job is to be that curious shopper. You have a regular account - nothing " +
    "more. No source code, no debugger hooks, no staff badge. Just the running app, " +
    "your browser's network tab, and whatever curiosity you bring. " +
    "\n\n" +
    "Become an administrator. Then capture the flag from somewhere only administrators " +
    "were ever supposed to reach.",
  category: 'APP01:2025 Broken Access Control',
  difficulty: 'hard',
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
    { level: 1, hint: "You don't own every order ID. But does the server agree?" },
    { level: 2, hint: "An endpoint that takes a coupon code exists - even if there's no form for it in the UI. What does it return for an internal code?" },
    { level: 3, hint: "Your account settings accept more fields than the UI sends. One extra field can change who you are - but only with the right header." },
    { level: 4, hint: "There's an admin-only route named after this challenge. Once you're admin, ask it nicely." },
  ],
};
