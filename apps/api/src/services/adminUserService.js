const { pool } = require('./db');

async function deleteUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM reviews WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_challenge_progress WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
    await client.query('DELETE FROM orders WHERE user_id = $1', [userId]);
    await client.query('UPDATE products SET created_by = NULL WHERE created_by = $1', [userId]);
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { deleteUser };
