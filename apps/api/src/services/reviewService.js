const { query } = require('./db');

async function getByProductId(productId) {
  const sql = `SELECT r.*, u.username FROM reviews r JOIN users u ON r.user_id = u.id
               WHERE r.product_id = $1 ORDER BY r.created_at DESC`;
  const result = await query(sql, [productId]);
  return result.rows;
}

/**
 * Create a review and return it joined with the author's username so the
 * frontend can render it immediately without a second fetch.
 */
async function create({ productId, userId, rating, title, comment }) {
  const insert = await query(
    `INSERT INTO reviews (product_id, user_id, rating, title, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [productId, userId, rating, title, comment]
  );
  const reviewId = insert.rows[0].id;

  const result = await query(
    `SELECT r.*, u.username FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.id = $1`,
    [reviewId]
  );
  return result.rows[0];
}

async function remove(reviewId, userId) {
  const result = await query('DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id', [reviewId, userId]);
  return result.rowCount > 0;
}

module.exports = { getByProductId, create, remove };
