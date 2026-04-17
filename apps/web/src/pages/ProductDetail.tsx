import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { mockProducts } from "@/data/mockData";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Star, ShoppingCart, ArrowLeft, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api, extractApiError, type ProductReview } from "@/lib/api";

function formatReviewDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export default function ProductDetail() {
  const { id } = useParams();
  const productId = Number(id);
  const product = mockProducts.find((p) => p.id === productId);
  const { addItem } = useCart();
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(productId)) {
      setLoadingReviews(false);
      return;
    }
    let cancelled = false;
    setLoadingReviews(true);
    api.getProductReviews(productId)
      .then((response) => {
        if (!cancelled) setReviews(response.reviews || []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingReviews(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!product) return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-display font-bold mb-4">Product not found</h1>
      <Link to="/products"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Products</Button></Link>
    </div>
  );

  const handleAddReview = async () => {
    if (!user) return;
    const comment = reviewText.trim();
    if (!comment) return;

    setSubmittingReview(true);
    try {
      const response = await api.createProductReview(productId, {
        rating: reviewRating,
        comment,
      });
      setReviews((prev) => [response.review, ...prev]);
      setReviewText("");
      setReviewRating(5);
      toast.success("Review submitted!");
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setSubmittingReview(false);
    }
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
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`w-4 h-4 ${s <= Math.round(product.rating) ? "fill-primary text-primary" : "text-muted"}`} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{product.rating} ({reviews.length} reviews)</span>
          </div>
          <p className="text-3xl font-display font-bold text-primary mb-4">${product.price.toFixed(2)}</p>
          <p className="text-muted-foreground mb-6">{product.description}</p>
          <p className="text-sm mb-6">
            <span className={product.stock > 0 ? "text-success" : "text-destructive"}>
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </span>
          </p>

          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center border rounded-lg">
              <button className="px-3 py-2 hover:bg-secondary" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className="px-4 py-2 font-medium">{qty}</span>
              <button className="px-3 py-2 hover:bg-secondary" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <Button size="lg" className="gap-2" onClick={() => { addItem(product.id, qty); toast.success("Added to cart!"); }}>
              <ShoppingCart className="w-5 h-5" /> Add to Cart
            </Button>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-16">
        <h2 className="font-display text-xl font-bold mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" /> Reviews ({reviews.length})
        </h2>

        {user && (
          <div className="border rounded-xl p-4 mb-6 space-y-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setReviewRating(s)}>
                  <Star className={`w-5 h-5 ${s <= reviewRating ? "fill-primary text-primary" : "text-muted"}`} />
                </button>
              ))}
            </div>
            <Textarea placeholder="Write your review..." value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
            <Button size="sm" onClick={handleAddReview} disabled={submittingReview || !reviewText.trim()}>
              {submittingReview ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        )}

        {loadingReviews ? (
          <p className="text-sm text-muted-foreground">Loading reviews...</p>
        ) : reviews.length === 0 ? (
          <p className="text-muted-foreground">No reviews yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{r.username}</span>
                  <span className="text-xs text-muted-foreground">{formatReviewDate(r.created_at)}</span>
                </div>
                <div className="flex mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-primary text-primary" : "text-muted"}`} />
                  ))}
                </div>
                {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
