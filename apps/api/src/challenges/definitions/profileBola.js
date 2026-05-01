module.exports = {
  slug: 'profile-bola',
  name: 'Broken Object Level Authorization',
  summary:
    'Unauthorized Object Access',
  description:
    "In a secure system, authentication is just the first lock. Object level authorization is the second. Many APIs fail by assuming that because you are *someone*, you have the right to see *everything*!\n\n" +
    "\nYour objective is to exploit this disconnect. Find the sensitive data that was never meant to reach the client side environment.\n The flag is waiting in the shadows of a response the developers thought you'd never look at.",
  category: 'API1:2023 Broken Object Level Authorization',
  difficulty: 'easy',
  flag: 'SHOPLAB{BOLA_HIDDEN_IN_NETWORK_TAB}',
  learningObjectives: [
    'Identify insecure direct object references within API endpoint structures.',
  ],
hints: [
    { level: 1, hint: 'Just because you are logged in as "User A" doesn\'t mean the server only knows how to talk about "User A".' },
    { level: 2, hint: 'The application distinguishes between "Who are you?" and "What are you allowed to see?". One of these checks might be missing.' },
    { level: 3, hint: 'Check the Network tab.' },
  ],
};