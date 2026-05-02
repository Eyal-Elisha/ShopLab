import { useState } from "react";
import { toast } from "sonner";
import { api, extractApiError, type AdminProduct } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProductEditDialog from "./ProductEditDialog";

function formatMoney(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function productImageMarkup(product: AdminProduct) {
  return `<img src="${product.image_url || "/placeholder.svg"}" alt="" class="h-12 w-12 rounded object-cover border" />`;
}

export default function AdminProductsTable({ products, onChanged }: { products: AdminProduct[]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});

  const deleteProduct = async (product: AdminProduct) => {
    if (!window.confirm(`Delete product ${product.name}?`)) return;
    setDeleting((prev) => ({ ...prev, [product.id]: true }));
    try {
      await api.deleteAdminProduct(product.id);
      toast.success(`${product.name} deleted.`);
      await onChanged();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDeleting((prev) => ({ ...prev, [product.id]: false }));
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="font-display">Products</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead>
              <TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell dangerouslySetInnerHTML={{ __html: productImageMarkup(p) }} />
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {p.category_name ? <Badge variant="secondary">{p.category_name}</Badge> : <span className="text-muted-foreground text-sm">--</span>}
                </TableCell>
                <TableCell>${formatMoney(p.price)}</TableCell>
                <TableCell>{p.stock}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteProduct(p)} disabled={deleting[p.id]}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ProductEditDialog product={editing} open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />
      </CardContent>
    </Card>
  );
}
