import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  extractApiError,
  type AdminDashboard,
  type AdminUser,
} from "@/lib/api";

function formatMoney(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState<Record<number, boolean>>({});

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

  const handleRoleChange = async (target: AdminUser, nextRole: "user" | "admin") => {
    if (target.role === nextRole) return;
    setRolePending((prev) => ({ ...prev, [target.id]: true }));
    try {
      await api.updateUserRole(target.id, nextRole);
      toast.success(`${target.username} is now ${nextRole}.`);
      await loadDashboard();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setRolePending((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    }
  };

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
          Admins manage user roles and inspect real orders and products. This is the only privileged
          surface in ShopLab.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading dashboard...</p>}
      {error && <p className="mb-6 text-sm text-destructive">{error}</p>}

      {dashboard && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-xl">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {s.label}
                  </CardTitle>
                  <s.icon className="w-5 h-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <p className="font-display text-2xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Users Table */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="font-display">Users</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.users.map((u) => {
                    const currentRole: "user" | "admin" = u.role === "admin" ? "admin" : "user";
                    const isSelf = u.id === user.id;
                    const pending = Boolean(rolePending[u.id]);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.username}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={currentRole}
                            onValueChange={(value) =>
                              handleRoleChange(u, value as "user" | "admin")
                            }
                            disabled={pending || isSelf}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">user</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="font-display">Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.id}</TableCell>
                        <TableCell>{order.username}</TableCell>
                        <TableCell>${formatMoney(order.total)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(order.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Products Table */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Products</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.category_name ? (
                          <Badge variant="secondary">{p.category_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>${formatMoney(p.price)}</TableCell>
                      <TableCell>{p.stock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
