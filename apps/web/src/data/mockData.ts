export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  stock: number;
  rating: number;
  reviews: Review[];
}

export interface Review {
  id: number;
  userId: number;
  username: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/** Demo users for the mock admin dashboard only (no secrets — real auth uses the API). */
export interface MockDashboardUser {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
}

export interface CartItem {
  productId: number;
  quantity: number;
}

export interface Order {
  id: number;
  userId: number;
  items: { productId: number; quantity: number; price: number }[];
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered";
  createdAt: string;
}

export const mockUsers: MockDashboardUser[] = [
  { id: 1, username: "admin", email: "admin@shoplab.io", role: "admin" },
  { id: 2, username: "johndoe", email: "john@example.com", role: "user" },
];

export const mockProducts: Product[] = [
  {
    id: 1, name: "Stealth Wireless Headphones", description: "Premium noise-cancelling wireless headphones with 40-hour battery life. Crystal-clear audio with deep bass response.",
    price: 249.99, category: "Electronics", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop", stock: 45, rating: 4.7,
    reviews: [
      { id: 1, userId: 2, username: "johndoe", rating: 5, comment: "Best headphones I've ever owned! The noise cancellation is incredible.", createdAt: "2026-03-15" },
    ],
  },
  {
    id: 2, name: "Vintage Leather Backpack", description: "Handcrafted genuine leather backpack with laptop compartment. Perfect for daily commute or weekend adventures.",
    price: 189.00, category: "Bags", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop", stock: 22, rating: 4.5,
    reviews: [],
  },
  {
    id: 3, name: "Mechanical Keyboard Pro", description: "RGB mechanical keyboard with Cherry MX switches. Hot-swappable keys and aluminum body.",
    price: 159.99, category: "Electronics", image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop", stock: 67, rating: 4.8,
    reviews: [
      { id: 2, userId: 2, username: "johndoe", rating: 5, comment: "The typing experience is unmatched. Love the tactile feedback!", createdAt: "2026-03-10" },
    ],
  },
  {
    id: 4, name: "Minimalist Watch", description: "Slim profile stainless steel watch with sapphire crystal. Japanese quartz movement.",
    price: 299.00, category: "Accessories", image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&h=400&fit=crop", stock: 15, rating: 4.6,
    reviews: [],
  },
  {
    id: 5, name: "Running Shoes X1", description: "Lightweight performance running shoes with responsive cushioning. Breathable mesh upper.",
    price: 129.99, category: "Footwear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop", stock: 88, rating: 4.4,
    reviews: [],
  },
  {
    id: 6, name: "Smart Water Bottle", description: "Temperature-tracking insulated bottle with LED display. Keeps drinks cold for 24h or hot for 12h.",
    price: 45.00, category: "Accessories", image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop", stock: 120, rating: 4.2,
    reviews: [],
  },
  {
    id: 7, name: "Portable Bluetooth Speaker", description: "360° immersive sound with deep bass. Waterproof and dustproof with 20-hour playtime.",
    price: 79.99, category: "Electronics", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop", stock: 54, rating: 4.3,
    reviews: [],
  },
  {
    id: 8, name: "Canvas Tote Bag", description: "Eco-friendly organic cotton tote with reinforced handles. Spacious interior with inner pocket.",
    price: 35.00, category: "Bags", image: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&h=400&fit=crop", stock: 200, rating: 4.1,
    reviews: [],
  },
];

export const categories = ["All", "Electronics", "Bags", "Accessories", "Footwear"];

export const mockOrders: Order[] = [
  {
    id: 1001, userId: 2, items: [
      { productId: 1, quantity: 1, price: 249.99 },
      { productId: 6, quantity: 2, price: 45.00 },
    ],
    total: 339.99, status: "delivered", createdAt: "2026-03-01",
  },
  {
    id: 1002, userId: 2, items: [
      { productId: 3, quantity: 1, price: 159.99 },
    ],
    total: 159.99, status: "shipped", createdAt: "2026-03-18",
  },
];
