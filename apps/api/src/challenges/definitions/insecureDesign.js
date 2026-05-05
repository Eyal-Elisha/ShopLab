module.exports = {
  slug: 'insecure-design',
  name: 'Price Tag Swap',
  summary:
    "ShopLab's checkout process looks secure on the surface, but legacy code still exists. Can you buy the most expensive item for pocket change?",
  description:
    "E-commerce platforms must strictly control pricing. A common Insecure Design flaw occurs when business logic trusts the client to dictate prices instead of verifying them against the backend database.\n\n" +
    "In ShopLab, the cart might fetch prices securely, but there's an old override logic in the checkout API endpoint that was never removed. " +
    "Your objective is to intercept the checkout process and manually specify a custom price for an expensive item.\n\n" +
    "Successfully purchase an item that originally costs more than $200 for $1 or less, and the system will reward you with a flag in the receipt response.",
  category: 'APP06:2025 Insecure Design',
  difficulty: 'easy',
  flag: 'SHOPLAB{pr1c3_t4g_sw4p_ins3cur3_d3sign}',
  learningObjectives: [
    'Understand business logic vulnerabilities and client-side trust issues',
    'Learn how to intercept and manipulate API JSON payloads',
    'Recognize the importance of validating critical data (like prices) securely on the server-side',
  ],
  hints: [
    { level: 1, hint: "Think about how modern shopping carts work. When you add items, your browser tracks them. But what data actually gets sent to the server when you finalize the order?" },
    { level: 2, hint: "Use your browser's Network tab or an interception proxy to inspect the checkout request. You'll notice the API expects a simple list of items you're purchasing." },
    { level: 3, hint: "Business logic flaws occur when the server trusts the client too much. What if the client tries to dictate facts that the server should be verifying on its own?" },
    { level: 4, hint: "Sometimes, developers leave in legacy override features for customer support or special promotions. What happens if you try to tell the server not just *what* you're buying, but *how much* it should cost?" },
    { level: 5, hint: "Try manually modifying the JSON payload of the checkout request before it reaches the server. If you inject a specific pricing property into an item's data structure, you might just get a massive discount." },
  ],
};
