module.exports = {
  slug: 'bfla-eval',
  name: 'Eval Swap',
  summary: 'A function restricted to admins might still accept regular authenticated users.',
  description: 
    'Locate an object containing a secret signature: "internal_access_hint". ' + 
    'Once found, change that specific object’s name to "Eval" to trigger the flag.',
  category: 'API5:2023 Broken Function Level Authorization',
  difficulty: 'hard',
  internalDifficulty: 7,
  flag: 'SHOPLAB{BFLA_METHOD_SWAP_SUCCESS}',
  learningObjectives: [
    'Understand Broken Function Level Authorization as a server side access control failure',
    'Differentiate endpoint/function authorization flaws from object-level authorization flaws',
    'Recognize why UI restrictions are not security boundaries for API functions',
  ],
  hints: [
    { level: 1, hint: 'Start by testing API behavior directly; UI visibility is not the same as permission.' },
    { level: 2, hint: 'Compare product responses by ID and look for one that contains an extra internal field.' },
    { level: 3, hint: 'Automation helps here: iterate product IDs and stop when internal_access_hint appears.' },
    { level: 4, hint: 'The target requires a function call, not just reading data: invoke the product update method.' },
    { level: 5, hint: 'Use PUT on that target product with name set to "Eval", then inspect product.name in the response.' },
  ],
};
