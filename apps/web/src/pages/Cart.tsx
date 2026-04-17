import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { mockProducts } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Trash2, ShoppingBag, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { api, extractApiError } from "@/lib/api";

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const cartProducts = items.map((item) => {
    const product = mockProducts.find((p) => p.id === item.productId);
    return { ...item, product };
  }).filter((i) => i.product);

  const total = cartProducts.reduce((sum, i) => sum + (i.product!.price * i.quantity), 0);

  const handleCheckout = async () => {
    if (!user) { navigate("/login"); return; }
    if (cartProducts.length === 0) return;

    setSubmitting(true);
    try {
      await api.checkout({
        items: cartProducts.map(({ productId, quantity }) => ({ productId, quantity })),
      });
      clearCart();
      toast.success("Order placed successfully!");
      navigate("/orders");
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingBag className="w-16 h-16 text-muted mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold mb-2">Cart is empty</h1>
        <p className="text-muted-foreground mb-6">Add some products to get started</p>
        <Link to="/products"><Button>Browse Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">Shopping Cart</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cartProducts.map(({ productId, quantity, product }) => (
            <div key={productId} className="flex gap-4 border rounded-xl p-4 bg-card">
              <img src={product!.image} alt={product!.name} className="w-24 h-24 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <Link to={`/products/${productId}`} className="font-display font-semibold hover:text-primary truncate block">
                  {product!.name}
                </Link>
                <p className="text-sm text-muted-foreground">{product!.category}</p>
                <p className="font-display font-bold text-primary mt-1">${product!.price.toFixed(2)}</p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(productId)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="flex items-center border rounded-lg">
                  <button className="px-2 py-1 hover:bg-secondary" onClick={() => updateQuantity(productId, quantity - 1)}><Minus className="w-3 h-3" /></button>
                  <span className="px-3 py-1 text-sm font-medium">{quantity}</span>
                  <button className="px-2 py-1 hover:bg-secondary" onClick={() => updateQuantity(productId, quantity + 1)}><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border rounded-xl p-6 bg-card h-fit sticky top-24">
          <h2 className="font-display font-bold text-lg mb-4">Order Summary</h2>
          <div className="space-y-2 mb-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="text-success">Free</span></div>
          </div>
          <div className="border-t pt-4 mb-6">
            <div className="flex justify-between font-display font-bold text-lg">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={submitting}>
            {submitting ? "Placing order..." : user ? "Place Order" : "Sign in to Checkout"}
          </Button>
        </div>
      </div>
    </div>
  );
}
