module.exports = {
  slug: 'blind-sql-injection-hard',
  name: 'Injection',
  summary:
    'Can you crack the admins password and retrieve the flag?',
  description:
    '' +
    '\n\n' +
    'Read about injections, and different kinds of them, and use that knowladge to capture the flag!',
  category: 'APP05:2025 Injection',
  difficulty: 'hard',
  flag: 'SHOPLAB{bl1nd_b00l34n_l0g1n}',
  learningObjectives: [
    'Understand Injection vulnerabilities.'
  ],
  hints: [
    { level: 1, hint: 'Try to log in and see what happens.' },
    { level: 2, hint: 'Try logging in with the username "admin".' },
    { level: 3, hint: "Think about what boolean conditions of the authentication logic." },
    { level: 4, hint: 'Use SQL Injection.' },
    { level: 5, hint: "'admin' AND SUBSTR(password, 1, 1) = 'S'-- -''"},
  ],
};
