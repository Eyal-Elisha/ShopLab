export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
  first_name?: string | null;
  last_name?: string | null;
}

export interface Hint {
  level: number;
  hint: string;
}

export interface ChallengePanelConfig {
  kind: string;
  title: string;
  description: string;
  guidance?: string[];
  targetOutcome?: string;
  [key: string]: unknown;
}

export interface ChallengeSurfaceConfig {
  route: string;
  label: string;
  title: string;
  description: string;
}

export interface Challenge {
  id: string | number;
  name: string;
  slug: string;
  description: string;
  summary?: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  solved: boolean;
  solvedAt?: string | null;
  learningObjectives?: string[];
  panel?: ChallengePanelConfig | null;
  surface?: ChallengeSurfaceConfig | null;
}

export interface ChallengeActionResult {
  success: boolean;
  message: string;
  stage?: string;
  error?: string;
  [key: string]: unknown;
}

export interface OrderItem {
  product_id: number;
  quantity: number;
  price: number;
  product_name: string;
}

export interface Order {
  id: number;
  user_id: number;
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  shipping_address?: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface ApiValidationError {
  msg: string;
  path?: string;
}

export interface ProductReview {
  id: number;
  product_id: number;
  user_id: number;
  username: string;
  rating: number;
  title?: string | null;
  comment: string | null;
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  role: "admin" | "user" | null;
  created_at: string;
}

export interface AdminOrder {
  id: number;
  user_id: number;
  username: string;
  email: string;
  total: number | string;
  status: Order["status"];
  shipping_address?: string | null;
  created_at: string;
}

export interface AdminProduct {
  id: number;
  name: string;
  description?: string | null;
  price: number | string;
  stock: number;
  image_url?: string | null;
  category_id?: number | null;
  category_name?: string | null;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number | string;
  stock: number;
  category_id?: number | null;
  category_name?: string | null;
  image_url?: string | null;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
}

export interface AdminDashboard {
  stats: {
    totalUsers: number;
    totalOrders: number;
    totalProducts: number;
  };
  users: AdminUser[];
  orders: AdminOrder[];
  products: AdminProduct[];
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export function extractApiError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { error?: string; message?: string; errors?: ApiValidationError[] };

    if (Array.isArray(maybeError.errors) && maybeError.errors.length > 0) {
      return maybeError.errors.map((entry) => entry.msg).join(", ");
    }

    if (maybeError.error) {
      return maybeError.error;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "Something went wrong.";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    throw data;
  }

  return data;
}

export const api = {
  login: (body: { username: string; password: string }) =>
    request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body,
    }),
  register: (body: { username: string; email: string; password: string; firstName?: string; lastName?: string }) =>
    request<{ user: AuthUser }>("/auth/register", {
      method: "POST",
      body,
    }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  getProfile: () => request<{ user: AuthUser }>("/auth/profile"),
  getCurrentUser: () => request<{ user: AuthUser }>("/user/me"),
  getUserProfileById: (userId: string | number) =>
    request<{ user: AuthUser & Record<string, unknown> }>(`/users/${userId}/profile`),
  updateCurrentUser: (body: { username: string; email: string }) =>
    request<{ user: AuthUser; message: string }>("/user/me", {
      method: "PUT",
      body,
    }),
  updateCurrentUserPassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>("/user/me/password", {
      method: "PUT",
      body,
    }),
  getOrders: () => request<{ orders: Order[] }>("/orders"),
  checkout: (body: { items: Array<{ productId: number; quantity: number }>; shippingAddress?: string }) =>
    request<{ order: Order; message: string }>("/orders/checkout", {
      method: "POST",
      body,
    }),
  getProducts: () => request<{ products: Product[] }>("/products"),
  getProduct: (productId: number) => request<{ product: Product }>(`/products/${productId}`),
  getProductCategories: () => request<{ categories: ProductCategory[] }>("/products/categories"),
  searchProducts: (q: string) => request<{ products: Product[]; query: string }>(`/products/search?q=${encodeURIComponent(q)}`),
  getProductReviews: (productId: number) =>
    request<{ reviews: ProductReview[] }>(`/products/${productId}/reviews`),
  createProductReview: (productId: number, body: { rating: number; comment: string }) =>
    request<{ review: ProductReview }>(`/products/${productId}/reviews`, {
      method: "POST",
      body,
    }),
  getAdminDashboard: () => request<AdminDashboard>("/admin/dashboard"),
  updateUserRole: (userId: number, role: "user" | "admin") =>
    request<{ user: { user_id: number; role: "user" | "admin" } }>(`/admin/users/${userId}/role`, {
      method: "PUT",
      body: { role },
    }),
  deleteAdminUser: (userId: number) =>
    request<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" }),
  updateAdminProduct: (productId: number, body: Partial<Pick<AdminProduct, "name" | "description" | "price" | "image_url">> & { category?: string | number }) =>
    request<{ product: AdminProduct }>(`/admin/products/${productId}`, {
      method: "PATCH",
      body,
    }),
  deleteAdminProduct: (productId: number) =>
    request<{ message: string }>(`/admin/products/${productId}`, { method: "DELETE" }),
  createAdminProduct: (body: { name: string; description: string; price: number; categoryId?: number; imageUrl?: string }) =>
    request<{ product: Product }>("/products", {
      method: "POST",
      body,
    }),
  getChallenges: () => request<{ challenges: Challenge[] }>("/challenges"),
  solveChallenge: (slug: string, flag: string) =>
    request<ChallengeActionResult>("/challenges/solve", {
      method: "POST",
      body: { slug, flag },
    }),
  getHints: (slug: string) => request<{ hints: Hint[] }>(`/hints/${slug}`),
};
