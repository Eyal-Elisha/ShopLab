module.exports = {
  slug: 'exceptional-conditions',
  name: 'Operation: Verbose Failure',
  summary:
    "A newsletter subscription feature fails to handle unexpected input types. Force the server to crash and leak its internal debug context.",
  description:
    "Robust applications must fail gracefully. When an application leaks internal state, stack traces, or environment variables during an error, it provides attackers with a roadmap of the system.\n\n" +
    "This challenge maps to OWASP A10:2025 — Mishandling of Exceptional Conditions.\n\n" +
    "Your objective: Find the newsletter subscription feature, determine how to trigger an unhandled exception by sending malformed input, and extract the flag from the verbose error response.",
  category: 'APP10:2025 Mishandling of Exceptional Conditions',
  difficulty: 'medium',
  flag: 'SHOPLAB{v3rb0s3_3rr0r_l3ak_410}',
  learningObjectives: [
    'Recognize the risk of verbose error messages in production environments',
    'Understand how malformed input types (type juggling) can cause unhandled exceptions',
    'Learn to differentiate between graceful error handling and information disclosure',
    'Understand why stack traces and internal state should never reach the client'
  ],
  hints: [
    { level: 1, hint: "The application allows users to subscribe to a newsletter. Have you found the signup form yet?" },
    { level: 2, hint: "Try submitting the form and observing the network request. What data format does it use?" },
    { level: 3, hint: "Most code expects a string for an email address. What happens if you send something else entirely, like an object or an array, in the JSON body?" },
    { level: 4, hint: "The server-side code might be calling string methods (like .toLowerCase()) on the input. In JavaScript, calling a string method on an object causes a TypeError. Try sending: {\"email\": {}}." },
    { level: 5, hint: "When the server crashes, look closely at the error response body. It might contain more than just an error message." }
  ],
};
