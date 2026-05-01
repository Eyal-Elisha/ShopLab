import { useEffect, useState } from "react";
import { api, extractApiError, type AdminProduct, type ProductCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Props { product: AdminProduct | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void>; }
const categoryValue = (p: AdminProduct) => String(p.category_id ?? p.category_name ?? "");

export default function ProductEditDialog({ product, open, onOpenChange, onSaved }: Props) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [category, setCategory] = useState(""); const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [price, setPrice] = useState(""); const [stock, setStock] = useState(""); const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setName(product.name); setDescription(product.description || ""); setCategory(categoryValue(product));
    setPrice(String(product.price)); setStock(String(product.stock)); setImageUrl(product.image_url || ""); setError(null);
  }, [product]);

  useEffect(() => {
    if (!open) return;
    api.getProductCategories().then((r) => setCategories(r.categories || [])).catch(() => setCategories([]));
  }, [open]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setSaving(true); setError(null);
    try {
      await api.updateAdminProduct(product.id, {
        name: name.trim(), description, category: category.trim(), price: Number(price), stock: Number(stock), image_url: imageUrl.trim(),
      });
      await onSaved(); onOpenChange(false);
    } catch (err) { setError(extractApiError(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><Label htmlFor="admin-product-name">Name</Label><Input id="admin-product-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="admin-product-price">Price</Label><Input id="admin-product-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="admin-product-category">Category</Label><Select value={category} onValueChange={setCategory} disabled={saving}><SelectTrigger id="admin-product-category"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="admin-product-stock">Stock</Label><Input id="admin-product-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="admin-product-image">Image URL</Label><Input id="admin-product-image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" disabled={saving} /></div>
          <div className="space-y-2"><Label htmlFor="admin-product-description">Description</Label><Textarea id="admin-product-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} /></div>
          <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
