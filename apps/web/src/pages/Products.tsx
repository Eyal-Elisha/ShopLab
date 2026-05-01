import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { api, extractApiError, type Product } from "@/lib/api";
import { toProductView } from "@/lib/productView";

export default function Products() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addItem } = useCart();

  useEffect(() => {
    api.getProducts()
      .then((response) => {
        setProducts(response.products || []);
        setError(null);
      })
      .catch((err) => setError(extractApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const productViews = products.map(toProductView);
  const categories = useMemo(() => ["All", ...new Set(productViews.map((p) => p.category))], [productViews]);
  const filtered = selectedCategory === "All" ? productViews : productViews.filter((p) => p.category === selectedCategory);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-2">Products</h1>
      <p className="text-muted-foreground mb-6">Browse our catalog of {productViews.length} products</p>
      {loading && <p className="text-sm text-muted-foreground mb-6">Loading products...</p>}
      {error && <p className="text-sm text-destructive mb-6">{error}</p>}

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
                  <span className="text-xs text-muted-foreground">Stock: {product.stock}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-lg">${product.price.toFixed(2)}</span>
                  <Button size="sm" variant="secondary" disabled={product.stock <= 0} onClick={(e) => { e.preventDefault(); addItem(product.id); }}>
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
