module.exports = {
  slug: 'jwt-none',
  name: 'Operation: Admin Takeover',
  summary:
    "ShopLab's admin panel is restricted, but the token verification logic has a critical flaw. Can you become the administrator and claim the throne?",
  description:
    "JSON Web Tokens (JWT) are used to manage sessions in ShopLab. When you log in, the server issues a signed token that identifies your role. " +
    "However, a legacy debugging fallback allows the server to accept tokens with the algorithm set to 'none', meaning no signature is verified.\n\n" +
    "Your objective: Forge a JWT token that claims you have the 'admin' role, then use it to access the restricted Admin Control Panel and retrieve the final flag.",
  category: 'APP07:2025 Authentication Failures',
  difficulty: 'medium',
  flag: 'SHOPLAB{jwt_n0n3_alg_bYp4ss_auth}',
  learningObjectives: [
    'Understand the structure of a JSON Web Token (header, payload, signature)',
    'Recognize how the "alg" header field controls signature verification',
    'Learn why servers must reject "none" algorithms in production',
    'Understand the difference between authentication bypass and vertical privilege escalation',
  ],
  hints: [
    {
      level: 1,
      hint: "Every request you make after login carries a 'shoplab_auth' cookie. Have you tried decoding it at jwt.io or in the console?",
    },
    {
      level: 2,
      hint: "A JWT has three parts. The first part (header) tells the server how to verify the signature. What happens if you tell it there is no signature to verify?",
    },
    {
      level: 3,
      hint: "The second part (payload) contains your identity and role. Try modifying your role to 'admin'. Remember to Base64URL encode the JSON!",
    },
    {
      level: 4,
      hint: "A JWT with 'alg':'none' must still have the correct structure: 'header.payload.' (note the trailing dot for the empty signature).",
    },
    {
      level: 5,
      hint: "Once your forged token is ready, inject it into the 'shoplab_auth' cookie and visit the Admin Control Panel (previously the VIP area).",
    },
  ],
};
