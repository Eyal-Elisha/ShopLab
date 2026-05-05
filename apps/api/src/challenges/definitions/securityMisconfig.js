module.exports = {
  name: "Operation: Hidden Backup",
  slug: "security-misconfig",
  category: "APP02:2025 Security Misconfiguration",
  difficulty: "easy",
  flag: "SHOPLAB{hidd3n_b4ckup_f0und_402}",
  summary: "Find a sensitive backup file that was accidentally left in a public directory.",
  description:
    "Security through obscurity is not security. Developers often leave sensitive files like backups, " +
    "configuration exports, or source code snippets in public directories, assuming they won't be found. " +
    "However, attackers use directory brute-forcing and common path guessing to find these 'hidden' gems. " +
    "\n\nIn this challenge, your goal is to find an exposed backup file that contains sensitive configuration data.",
  learningObjectives: [
    "Identify common security misconfigurations.",
    "Understand the risks of exposed sensitive files in the web root.",
    "Learn to use reconnaissance tools or simple manual guessing to find hidden resources.",
    "Understand how 'robots.txt' can inadvertently reveal sensitive paths to attackers.",
  ],
  hints: [
    {
      level: 1,
      hint:
        "Attackers always start by mapping the application's surface. " +
        "Have you checked the site's 'robots.txt' file? It often contains a list of directories the developer wants to hide.",
    },
    {
      level: 2,
      hint:
        "The 'robots.txt' file mentions a specific file that shouldn't be indexed. Try navigating to that path directly in your browser.",
    },
    {
      level: 3,
      hint:
        "Once you've found the file (db.config.bak), open it and look for any sensitive information or a flag.",
    },
  ],
  surface: null, // This challenge is discovered via robots.txt
};
