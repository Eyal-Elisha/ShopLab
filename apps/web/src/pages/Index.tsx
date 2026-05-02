import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Search, Shield, ArrowRight, Star } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { SupportChatDock } from "@/components/SupportChatWidget";
import { api, type Product } from "@/lib/api";
import { toProductView } from "@/lib/productView";

export default function Index() {
  const { addItem } = useCart();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api.getProducts().then((response) => setProducts(response.products || [])).catch(() => setProducts([]));
  }, []);

  const featured = products.slice(0, 4).map(toProductView);

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent py-20 md:py-32">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Shield className="w-4 h-4" /> Course Base Template
            </span>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Build modern security labs<br /><span className="text-primary">inside a realistic storefront.</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-lg">
              ShopLab is an e-commerce security training template for OWASP-style web and API exercises.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/products"><Button size="lg" className="gap-2">Browse Products <ArrowRight className="w-4 h-4" /></Button></Link>
              <Link to="/challenges"><Button size="lg" variant="secondary" className="gap-2"><Shield className="w-4 h-4" /> Try Challenges</Button></Link>
              <Link to="/search?q="><Button size="lg" variant="outline" className="gap-2"><Search className="w-4 h-4" /> Search</Button></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Featured Products</h2>
          <Link to="/products" className="text-primary text-sm font-medium hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((product) => (
            <Link key={product.id} to={`/products/${product.id}`} className="group">
              <div className="rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                <div className="aspect-square overflow-hidden bg-secondary/30">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">{product.category}</p>
                  <h3 className="font-display font-semibold truncate">{product.name}</h3>
                  <div className="flex items-center gap-1 mt-1 mb-3"><Star className="w-3.5 h-3.5 fill-primary text-primary" /><span className="text-sm text-muted-foreground">{product.rating}</span></div>
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-lg">${product.price.toFixed(2)}</span>
                    <Button size="sm" variant="secondary" disabled={product.stock <= 0} onClick={(e) => { e.preventDefault(); addItem(product.id); }}><ShoppingCart className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <SupportChatDock />
    </div>
  );
}
