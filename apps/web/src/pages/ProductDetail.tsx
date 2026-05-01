import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Star, ShoppingCart, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api, extractApiError } from "@/lib/api";
import { toProductView, type ProductView } from "@/lib/productView";
import ProductReviews from "@/components/products/ProductReviews";

export default function ProductDetail() {
  const { id } = useParams();
  const productId = Number(id);
  const { addItem } = useCart();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!Number.isFinite(productId)) return;
    api.getProduct(productId)
      .then((response) => {
        setProduct(toProductView(response.product));
        setError(null);
      })
      .catch((err) => setError(extractApiError(err)));
  }, [productId]);

  if (error) return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-display font-bold mb-4">{error}</h1>
      <Link to="/products"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Products</Button></Link>
    </div>
  );
  if (!product) return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading product...</div>;

  const addToCart = () => {
    addItem(product.id, qty);
    toast.success("Added to cart!");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/products" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Products
      </Link>
      <div className="grid md:grid-cols-2 gap-10">
        <div className="rounded-xl overflow-hidden bg-secondary/30 border">
          <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">{product.category}</p>
          <h1 className="font-display text-3xl font-bold mb-2">{product.name}</h1>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 fill-primary text-primary" />
            <span className="text-sm text-muted-foreground">{product.rating}</span>
          </div>
          <p className="text-3xl font-display font-bold text-primary mb-4">${product.price.toFixed(2)}</p>
          <p className="text-muted-foreground mb-6">{product.description}</p>
          <p className={`text-sm mb-6 ${product.stock > 0 ? "text-success" : "text-destructive"}`}>
            {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
          </p>
          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center border rounded-lg">
              <button className="px-3 py-2 hover:bg-secondary" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
              <span className="px-4 py-2 font-medium">{qty}</span>
              <button className="px-3 py-2 hover:bg-secondary" onClick={() => setQty(Math.min(product.stock, qty + 1))}>+</button>
            </div>
            <Button size="lg" className="gap-2" disabled={product.stock <= 0} onClick={addToCart}>
              <ShoppingCart className="w-5 h-5" /> Add to Cart
            </Button>
          </div>
        </div>
      </div>
      <ProductReviews productId={productId} canReview={Boolean(user)} />
    </div>
  );
}
