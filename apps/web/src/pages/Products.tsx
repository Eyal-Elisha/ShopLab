import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star, Search, AlertCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useQuery } from "@tanstack/react-query";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category_name?: string;
  image_url?: string;
  rating?: number;
  flag_value?: string;
  value?: string;
}

export default function Products() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const { addItem } = useCart();

  const { data, isLoading, error } = useQuery({
    queryKey: ["products", searchQuery],
    queryFn: async () => {
      const url = searchQuery 
        ? `/api/products/search?q=${encodeURIComponent(searchQuery)}`
        : `/api/products`;
        
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "An error occurred");
      }
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.products || []);
    },
    retry: false
  });

  const products: Product[] = data || [];
  
  // Extract categories dynamically
  const categories = ["All", ...new Set(products.map((p) => p.category_name || "Unknown"))].filter(Boolean);

  const filtered = selectedCategory === "All" 
    ? products 
    : products.filter((p) => (p.category_name || "Unknown") === selectedCategory);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Products</h1>
          <p className="text-muted-foreground">Browse our catalog of {products.length} products</p>
        </div>
        
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <Button key={cat} size="sm" variant={selectedCategory === cat ? "default" : "outline"} onClick={() => setSelectedCategory(cat)}>
            {cat}
          </Button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">Query Error</h3>
            <p className="text-sm font-mono mt-1">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((product) => (
            <Link key={product.id} to={`/products/${product.id}`} className="group">
              <div className="rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                <div className="aspect-square overflow-hidden bg-secondary/30">
                  <img src={product.image_url} alt={product.name || product.value} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">{product.category_name || "Unknown"}</p>
                  <h3 className="font-display font-semibold truncate">{product.name || product.value || "Unknown Product"}</h3>
                  <div className="flex items-center gap-1 mt-1 mb-3">
                    <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                    <span className="text-sm text-muted-foreground">{product.rating || 5}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-lg">${Number(product.price || 0).toFixed(2)}</span>
                    <Button size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); addItem(product.id); }}>
                      <ShoppingCart className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-lg font-display font-semibold mb-2">No products found</p>
          <p className="text-muted-foreground">Try different keywords or select another category</p>
        </div>
      )}
      
      {/* 
        VULNERABILITY CLUE: This comment is intentionally rendered into the DOM 
        to simulate a developer oversight. 
      */}
      <div dangerouslySetInnerHTML={{ __html: '<!-- INFO: Search indexing for legacy backups is disabled. See robots.txt for exclusion list. -->' }} />
    </div>
  );
}
