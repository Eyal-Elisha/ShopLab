import { useSearchParams, Link } from "react-router-dom";
import { mockProducts } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star, Search } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useState } from "react";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [localQuery, setLocalQuery] = useState(query);
  const { addItem } = useCart();

  const results = query
    ? mockProducts.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ q: localQuery });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-6">Search</h1>

      <form onSubmit={handleSearch} className="flex gap-3 mb-8 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search products, categories..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {query && (
        <p className="text-muted-foreground mb-6">
          Showing {results.length} result{results.length !== 1 ? "s" : ""} for "<span className="font-medium text-foreground">{query}</span>"
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {results.map((product) => (
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

      {query && results.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-lg font-display font-semibold mb-2">No results found</p>
          <p className="text-muted-foreground">Try different keywords or browse all products</p>
          <Link to="/products"><Button variant="outline" className="mt-4">Browse Products</Button></Link>
        </div>
      )}
    </div>
  );
}
