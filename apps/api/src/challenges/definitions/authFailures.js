module.exports = {
  slug: 'jwt-none',
  name: 'Operation: Ghost Identity',
  summary:
    "ShopLab's token verification has a skeleton in its closet. Authentication can be bypassed entirely — no password needed. Can you become someone you're not?",
  description:
    "JSON Web Tokens are the backbone of ShopLab's authentication. Every request you make after logging in carries a signed JWT that the server trusts. " +
    "But what happens when the server forgets to enforce the signature?\n\n" +
    "A common Authentication Failure is accepting a JWT with its algorithm set to 'none'. " +
    "This tells the server: 'Trust me, I signed this myself.' — and a misconfigured server believes it.\n\n" +
    "Your objective: forge a valid-looking JWT token for the admin user without knowing any secret key. " +
    "Then use that token to access a protected endpoint and retrieve the flag.",
  category: 'APP07:2025 Authentication Failures',
  difficulty: 'medium',
  flag: 'SHOPLAB{jwt_n0n3_alg_bYp4ss_auth}',
  learningObjectives: [
    'Understand the structure of a JSON Web Token (header, payload, signature)',
    'Recognize how the "alg" header field controls signature verification',
    'Learn why servers must whitelist accepted algorithms and reject "none"',
    'Understand why authentication and authorization must both be enforced server-side',
  ],
  hints: [
    {
      level: 1,
      hint: "Every request you make after login includes a token. Copy one from your browser's DevTools and paste it into a JWT decoder — what are its three parts?",
    },
    {
      level: 2,
      hint: "A JWT's first part (the header) describes the token itself, not you. One field in particular tells the server which cryptographic algorithm was used to sign it. What happens if you change it?",
    },
    {
      level: 3,
      hint: "Some JWT libraries have a special value for the algorithm field that means 'no signature required'. If the server doesn't explicitly block this value, you can craft a token the server will accept without ever knowing the secret key.",
    },
    {
      level: 4,
      hint: "A JWT is just three Base64URL-encoded JSON strings joined by dots. You can craft one entirely by hand — or use an online tool. The payload should claim to be the admin user. The key is knowing which field in the header to change.",
    },
    {
      level: 5,
      hint: "Once you've crafted your unsigned token, you need to send it to the server. The app reads the token from a cookie named 'shoplab_auth'. Try injecting your forged token there and then calling a protected endpoint.",
    },
  ],
  // Surface: point players to the dedicated JWT flag endpoint
  surface: {
    route: '/api/auth/jwt-flag',
    label: 'Call the protected endpoint',
    title: 'JWT Flag Endpoint',
    description:
      'Use your forged token to call GET /api/auth/jwt-flag. If the server accepts it, you will receive the flag.',
  },
};
