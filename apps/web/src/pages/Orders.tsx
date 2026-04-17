import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";
import { Package } from "lucide-react";
import { api, extractApiError, type Order } from "@/lib/api";

function formatMoney(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

export default function Orders() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getOrders()
      .then((response) => {
        setOrders(response.orders);
        setError(null);
      })
      .catch((err) => {
        setError(extractApiError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-8">My Orders</h1>

      {loading && <p className="text-sm text-muted-foreground">Loading your orders...</p>}
      {error && <p className="mb-6 text-sm text-destructive">{error}</p>}

      {!loading && orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-muted mx-auto mb-4" />
          <p className="text-lg font-display font-semibold mb-2">No orders yet</p>
          <div className="flex justify-center gap-4 text-sm">
            <Link to="/products" className="text-primary hover:underline">Start shopping</Link>
          </div>
        </div>
      ) : !loading ? (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="border rounded-xl p-6 bg-card">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <p className="font-display font-bold">Order #{order.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="font-display font-bold">${formatMoney(order.total)}</span>
              </div>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={`${order.id}-${item.product_id}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product_name || "Unknown product"}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × ${formatMoney(item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
