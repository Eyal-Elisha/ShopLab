const { query, pool } = require('./db');

const ORDER_ITEMS_JSON = `COALESCE(
  json_agg(
    json_build_object(
      'product_id', oi.product_id,
      'quantity', oi.quantity,
      'price', oi.price_at_time,
      'product_name', p.name
    )
  ) FILTER (WHERE oi.id IS NOT NULL),
  '[]'::json
) AS items`;

async function getByUserId(userId) {
  const sql = `SELECT o.*, ${ORDER_ITEMS_JSON}
               FROM orders o
               LEFT JOIN order_items oi ON o.id = oi.order_id
               LEFT JOIN products p ON oi.product_id = p.id
               WHERE o.user_id = $1
               GROUP BY o.id ORDER BY o.created_at DESC`;
  const result = await query(sql, [userId]);
  return result.rows;
}

async function getById(orderId) {
  const sql = `SELECT o.*, ${ORDER_ITEMS_JSON}
               FROM orders o
               LEFT JOIN order_items oi ON o.id = oi.order_id
               LEFT JOIN products p ON oi.product_id = p.id
               WHERE o.id = $1
               GROUP BY o.id`;
  const result = await query(sql, [orderId]);
  return result.rows[0] || null;
}

async function getReceipt(orderId) {
  const sql = `SELECT o.id, o.user_id, o.total, o.status, o.shipping_address,
                      o.staff_notes, o.created_at,
                      ${ORDER_ITEMS_JSON}
               FROM orders o
               LEFT JOIN order_items oi ON o.id = oi.order_id
               LEFT JOIN products p ON oi.product_id = p.id
               WHERE o.id = $1
               GROUP BY o.id`;
  const result = await query(sql, [orderId]);
  return result.rows[0] || null;
}

/**
 * Create an order from the server-side cart rows returned by cartService.getCart.
 * Each cart row already carries `price` and `product_id`.
 */
async function create(userId, shippingAddress, cartItems) {
  let total = 0;
  for (const item of cartItems) {
    total += Number(item.price) * Number(item.quantity);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'INSERT INTO orders (user_id, total, shipping_address) VALUES ($1, $2, $3) RETURNING *',
      [userId, total, shippingAddress]
    );
    const order = orderResult.rows[0];

    for (const item of cartItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, item.price]
      );
    }

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create an order directly from a list of { productId, quantity } pairs.
 * Prices are resolved from the DB so the client cannot set their own total.
 */
async function createFromItems(userId, shippingAddress, items) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('At least one item is required to checkout.');
    error.status = 400;
    throw error;
  }

  const productIds = [...new Set(items.map((item) => Number(item.productId)).filter(Boolean))];
  if (productIds.length === 0) {
    const error = new Error('Invalid cart items.');
    error.status = 400;
    throw error;
  }

  const productRows = await query(
    'SELECT id, name, price FROM products WHERE id = ANY($1::int[])',
    [productIds]
  );
  const priceById = new Map(productRows.rows.map((row) => [row.id, row]));

  const resolvedItems = items.map((item) => {
    const productId = Number(item.productId);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const product = priceById.get(productId);
    if (!product) {
      const error = new Error(`Product ${item.productId} does not exist.`);
      error.status = 400;
      throw error;
    }
    return {
      product_id: productId,
      quantity,
      price: Number(product.price),
    };
  });

  return create(userId, shippingAddress, resolvedItems);
}

async function getAllOrders() {
  const sql = `SELECT o.*, u.username, u.email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`;
  const result = await query(sql);
  return result.rows;
}

async function updateStatus(orderId, status) {
  const result = await query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, orderId]);
  return result.rows[0];
}

module.exports = { getByUserId, getById, getReceipt, create, createFromItems, getAllOrders, updateStatus };
