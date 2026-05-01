import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api, extractApiError, type ProductCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AdminCreateProduct() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [price, setPrice] = useState(""); const [stock, setStock] = useState("");
  const [categoryId, setCategoryId] = useState(""); const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;
    api.getProductCategories().then((r) => setCategories(r.categories || [])).catch(() => setCategories([]));
  }, [user, isAdmin]);

  if (!user || !isAdmin) return <Navigate to="/" />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.createAdminProduct({
        name: name.trim(), description: description.trim(), price: Number(price), stock: Number(stock),
        categoryId: categoryId ? Number(categoryId) : undefined, imageUrl: imageUrl.trim() || undefined,
      });
      toast.success("Product created.");
      navigate("/admin");
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6"><h1 className="font-display text-3xl font-bold">Create Product</h1></div>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="font-display">New catalog item</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2"><Label htmlFor="new-product-name">Name</Label><Input id="new-product-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} /></div>
            <div className="space-y-2"><Label htmlFor="new-product-description">Description</Label><Textarea id="new-product-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="new-product-price">Price</Label><Input id="new-product-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} disabled={saving} /></div>
              <div className="space-y-2"><Label htmlFor="new-product-stock">Stock</Label><Input id="new-product-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} disabled={saving} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="new-product-category">Category</Label><select id="new-product-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={saving} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">Uncategorized</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="new-product-image">Image URL</Label><Input id="new-product-image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={saving} placeholder="https://example.com/image.jpg" /></div>
            <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Product"}</Button><Button asChild variant="outline" type="button"><Link to="/admin">Cancel</Link></Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
