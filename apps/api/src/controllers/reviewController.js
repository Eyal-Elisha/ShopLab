const reviewService = require('../services/reviewService');

async function getReviews(req, res, next) {
  try {
    const reviews = await reviewService.getByProductId(req.params.productId);
    res.json({ reviews });
  } catch (err) { next(err); }
}
async function createReview(req, res, next) {
  try {
    const review = await reviewService.create({
      productId: req.params.productId,
      userId: req.user.id,
      ...req.body,
    });
    res.status(201).json({ review });
  } catch (err) { next(err); }
}
async function deleteReview(req, res, next) {
  try {
    const deleted = await reviewService.remove(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Review not found or not yours' });
    res.json({ message: 'Review deleted' });
  } catch (err) { next(err); }
}

module.exports = { getReviews, createReview, deleteReview };
