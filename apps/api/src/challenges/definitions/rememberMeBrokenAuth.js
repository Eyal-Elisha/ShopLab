module.exports = {
  slug: 'remember-me-broken-auth',
  name: 'AuthentiDanger',
  summary:
    'Authentication mechanisms can fail when identity is trusted without proper verification.',
  description:
    'Broken Authentication occurs when an application incorrectly handles user identity, allowing attackers to impersonate other users. ' +
    'Analyze how authentication is implemented in this system, identify any weak or unverified identity mechanisms, ' +
    'and use this knowledge to access the protected endpoint at /api/admin/broken-auth-flag and retrieve the flag.',
  category: 'API2:2023 Broken Authentication',
  difficulty: 'medium',
  flag: 'SHOPLAB{remember_me_is_not_auth}',
  learningObjectives: [
    'Understand common Broken Authentication weaknesses',
    'Recognize when identity data is trusted without proper verification',
  ],
  hints: [
    { level: 1, hint: 'Check how the server determines who you are when a request is made.' },
    { level: 2, hint: 'Look at what browser storage changes after a successful login.' },
    { level: 3, hint: 'Base64 isn\'t always enough...' },
  ],
};
