const { query, pool } = require('./db');

async function resolveCategoryId(category) {
  if (category === undefined) return undefined;
  if (category === null || category === '') return null;
  const numeric = Number(category);
  if (Number.isInteger(numeric)) return numeric;

  const result = await query(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) OR LOWER(slug) = LOWER($1)',
    [String(category)]
  );
  return result.rows[0]?.id ?? null;
}

async function updateProduct(productId, body) {
  const categoryId = await resolveCategoryId(body.category ?? body.categoryId);
  const fields = [];
  const values = [];

  const add = (column, value) => {
    if (value === undefined) return;
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  add('name', body.name);
  add('description', body.description);
  add('price', body.price === undefined ? undefined : Number(body.price));
  add('category_id', categoryId);
  add('image_url', body.imageUrl ?? body.image_url);
  if (fields.length === 0) return null;

  values.push(productId);
  const result = await query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteProduct(productId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cart_items WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM reviews WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM order_items WHERE product_id = $1', [productId]);
    const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { updateProduct, deleteProduct };
