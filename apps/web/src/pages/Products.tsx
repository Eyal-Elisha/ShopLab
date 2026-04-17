import { useState } from "react";
import { Link } from "react-router-dom";
import { mockProducts, categories } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export default function Products() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { addItem } = useCart();

  const filtered = selectedCategory === "All" ? mockProducts : mockProducts.filter((p) => p.category === selectedCategory);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-2">Products</h1>
      <p className="text-muted-foreground mb-6">Browse our catalog of {mockProducts.length} products</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <Button key={cat} size="sm" variant={selectedCategory === cat ? "default" : "outline"} onClick={() => setSelectedCategory(cat)}>
            {cat}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((product) => (
          <Link key={product.id} to={`/products/${product.id}`} className="group">
            <div className="rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="aspect-square overflow-hidden bg-secondary/30">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{product.category}</p>
                <h3 className="font-display font-semibold truncate">{product.name}</h3>
                <div className="flex items-center gap-1 mt-1 mb-3">
                  <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                  <span className="text-sm text-muted-foreground">{product.rating}</span>
                  <span className="text-xs text-muted-foreground">({product.reviews.length})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-lg">${product.price.toFixed(2)}</span>
                  <Button size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); addItem(product.id); }}>
                    <ShoppingCart className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
