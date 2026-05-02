import { useEffect, useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";
import { api, extractApiError, type ProductReview } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function formatReviewDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export default function ProductReviews({ productId, canReview }: { productId: number; canReview: boolean }) {
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getProductReviews(productId)
      .then((response) => { if (!cancelled) setReviews(response.reviews || []); })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const submitReview = async () => {
    if (!canReview || !reviewText.trim()) return;
    setSubmitting(true);
    try {
      const response = await api.createProductReview(productId, { rating: reviewRating, comment: reviewText.trim() });
      setReviews((prev) => [response.review, ...prev]);
      setReviewText("");
      setReviewRating(5);
      toast.success("Review submitted!");
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16">
      <h2 className="font-display text-xl font-bold mb-6 flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Reviews ({reviews.length})</h2>
      {canReview && <div className="border rounded-xl p-4 mb-6 space-y-3">
        <div className="flex gap-2">{[1, 2, 3, 4, 5].map((s) => <button key={s} onClick={() => setReviewRating(s)}><Star className={`w-5 h-5 ${s <= reviewRating ? "fill-primary text-primary" : "text-muted"}`} /></button>)}</div>
        <Textarea placeholder="Write your review..." value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
        <Button size="sm" onClick={submitReview} disabled={submitting || !reviewText.trim()}>{submitting ? "Submitting..." : "Submit Review"}</Button>
      </div>}
      {loading ? <p className="text-sm text-muted-foreground">Loading reviews...</p> : reviews.map((r) => (
        <div key={r.id} className="border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{r.username}</span>
            <span className="text-xs text-muted-foreground">{formatReviewDate(r.created_at)}</span>
          </div>
          {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
        </div>
      ))}
    </section>
  );
}
