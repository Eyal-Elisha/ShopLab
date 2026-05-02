module.exports = {
  slug: 'sql-injection',
  name: 'Data Exfiltration',
  summary:
    "A product search feature was quickly wired up without parameterized queries. Exploit the vulnerability to read sensitive data from the database.",
  description:
    "The search bar on the products page connects directly to the database. However, the developer concatenated the search term directly into the SQL string instead of using parameterized inputs. " +
    "\n\n" +
    "This allows a malicious user to break out of the intended query structure and execute their own SQL commands. " +
    "\n\n" +
    "Your objective: Use a UNION-based SQL injection to exfiltrate the flag from the `system_settings` table.",
  category: 'APP05:2025 Injection',
  difficulty: 'medium',
  flag: 'SHOPLAB{h1dd3n_d4t4_un10n_str1k3s}',
  learningObjectives: [
    'Identify un-sanitized input leading to SQL injection',
    'Craft a UNION-based SQL injection payload',
    'Understand how column counts and types must match in a UNION statement',
    'Extract data from an unintended table'
  ],
  hints: [
    { level: 1, hint: "If input isn't sanitized, certain punctuation marks might be interpreted as code instead of text. Try to intentionally cause a syntax error." },
    { level: 2, hint: "Once you break the query, your next goal is to successfully terminate it. Punctuation that acts as a comment can effectively silence the rest of the original query." },
    { level: 3, hint: "To exfiltrate data from another table, you'll need to append your own query using a specific SQL operator that merges result sets." },
    { level: 4, hint: "Databases are strict: when merging two queries, they must ask for the exact same number of columns. Keep adding NULLs to your injection until the error disappears." },
    { level: 5, hint: "You now control the query, and you know the column count. All that is left is to query the 'value' column from the 'system_settings' table, placing it in a position where the UI will render it (like the product's name or description)." }
  ],
};
