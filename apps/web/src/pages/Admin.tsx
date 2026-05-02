import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Users, ShoppingBag } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, extractApiError, type AdminDashboard } from "@/lib/api";
import AdminOrdersTable from "@/components/admin/AdminOrdersTable";
import AdminProductsTable from "@/components/admin/AdminProductsTable";
import AdminUsersTable from "@/components/admin/AdminUsersTable";

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAdminDashboard();
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadDashboard();
  }, [user, isAdmin, loadDashboard]);

  if (!user || !isAdmin) return <Navigate to="/" />;

  const stats = dashboard
    ? [
        { label: "Total Users", value: dashboard.stats.totalUsers, icon: Users },
        { label: "Total Orders", value: dashboard.stats.totalOrders, icon: ShoppingBag },
      ]
    : [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground max-w-2xl">
          Admins manage user roles, products, inventory, and orders from this privileged surface.
        </p>
        <div className="mt-4">
          <Button asChild><Link to="/admin/products/new">Create Product</Link></Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading dashboard...</p>}
      {error && <p className="mb-6 text-sm text-destructive">{error}</p>}

      {dashboard && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-xl">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                  <s.icon className="w-5 h-5 text-primary" />
                </CardHeader>
                <CardContent><p className="font-display text-2xl font-bold">{s.value}</p></CardContent>
              </Card>
            ))}
          </div>

          <AdminUsersTable users={dashboard.users} currentUserId={user.id} onChanged={loadDashboard} />
          <AdminOrdersTable orders={dashboard.orders} />
          <AdminProductsTable products={dashboard.products} onChanged={loadDashboard} />
        </>
      )}
    </div>
  );
}
