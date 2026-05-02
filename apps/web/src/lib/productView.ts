import { type Product } from "@/lib/api";

export interface ProductView {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  stock: number;
  rating: number;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    name: product.name,
    description: product.description || "",
    price: Number(product.price),
    category: product.category_name || "Uncategorized",
    image: product.image_url || "/placeholder.svg",
    stock: Number(product.stock) || 0,
    rating: 4.5,
  };
}
