const { query } = require('./db');

async function getCart(userId) {
  const sql = `SELECT ci.*, p.name, p.price, p.image_url, p.stock
               FROM cart_items ci JOIN products p ON ci.product_id = p.id
               WHERE ci.user_id = $1 ORDER BY ci.added_at DESC`;
  const result = await query(sql, [userId]);
  return result.rows;
}

async function addItem(userId, productId, quantity = 1) {
  const sql = `INSERT INTO cart_items (user_id, product_id, quantity)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id, product_id)
               DO UPDATE SET quantity = cart_items.quantity + $3
               RETURNING *`;
  const result = await query(sql, [userId, productId, quantity]);
  return result.rows[0];
}

async function updateQuantity(userId, productId, quantity) {
  const result = await query(
    'UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3 RETURNING *',
    [quantity, userId, productId]
  );
  return result.rows[0];
}

async function removeItem(userId, productId) {
  await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
}

async function clearCart(userId) {
  await query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
}

module.exports = { getCart, addItem, updateQuantity, removeItem, clearCart };
