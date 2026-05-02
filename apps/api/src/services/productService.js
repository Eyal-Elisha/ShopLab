// ============================================================
// Product Service — Raw SQL queries for product operations
// ============================================================
const { query } = require('./db');

async function getAll({ limit = 50, offset = 0, categoryId } = {}) {
  let sql = `SELECT p.*, c.name as category_name
             FROM products p LEFT JOIN categories c ON p.category_id = c.id`;
  const params = [];
  
  if (categoryId) {
    params.push(categoryId);
    sql += ` WHERE p.category_id = $${params.length}`;
  }
  
  sql += ' ORDER BY p.created_at DESC';
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  params.push(offset);
  sql += ` OFFSET $${params.length}`;
  
  const result = await query(sql, params);
  return result.rows;
}

async function getById(id) {
  const sql = `SELECT p.*, c.name as category_name
               FROM products p LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.id = $1`;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
}

/**
 * Search products by name or description (parameterized ILIKE).
 */
async function search(searchTerm) {
  const sql = `SELECT p.*, c.name as category_name
               FROM products p LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.name ILIKE $1 OR p.description ILIKE $1
               ORDER BY p.created_at DESC`;
  const result = await query(sql, [`%${searchTerm}%`]);
  return result.rows;
}

function randomDisplayStock() {
  return Math.floor(Math.random() * 96) + 5;
}

async function create({ name, description, price, stock, categoryId, imageUrl, createdBy }) {
  const displayStock = stock === undefined ? randomDisplayStock() : stock;
  const sql = `INSERT INTO products (name, description, price, stock, category_id, image_url, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`;
  const result = await query(sql, [name, description, price, displayStock, categoryId, imageUrl, createdBy]);
  return result.rows[0];
}

async function update(id, { name, description, price, stock, categoryId, imageUrl }) {
  const sql = `UPDATE products SET name = $1, description = $2, price = $3, stock = $4,
               category_id = $5, image_url = $6, updated_at = NOW()
               WHERE id = $7 RETURNING *`;
  const result = await query(sql, [name, description, price, stock, categoryId, imageUrl, id]);
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

async function getCategories() {
  const result = await query('SELECT * FROM categories ORDER BY name');
  return result.rows;
}

async function getAllIds() {
  const result = await query('SELECT id FROM products ORDER BY id ASC');
  return result.rows.map((row) => row.id);
}

const SEED_CATEGORIES = [
  { id: 1, name: 'Electronics', slug: 'electronics', description: 'Gadgets, devices, and tech accessories' },
  { id: 2, name: 'Bags', slug: 'bags', description: 'Backpacks, totes, and carry essentials' },
  { id: 3, name: 'Accessories', slug: 'accessories', description: 'Watches, bottles, and everyday accessories' },
  { id: 4, name: 'Footwear', slug: 'footwear', description: 'Shoes and sneakers' },
];

// Kept in sync with apps/web/src/data/mockData.ts so storefront product IDs resolve in the DB.
const SEED_PRODUCTS = [
  { id: 1, name: 'Stealth Wireless Headphones', description: 'Premium noise-cancelling wireless headphones with 40-hour battery life. Crystal-clear audio with deep bass response.', price: 249.99, stock: 45, categoryId: 1, imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop' },
  { id: 2, name: 'Vintage Leather Backpack', description: 'Handcrafted genuine leather backpack with laptop compartment. Perfect for daily commute or weekend adventures.', price: 189.00, stock: 22, categoryId: 2, imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop' },
  { id: 3, name: 'Mechanical Keyboard Pro', description: 'RGB mechanical keyboard with Cherry MX switches. Hot-swappable keys and aluminum body.', price: 159.99, stock: 67, categoryId: 1, imageUrl: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop' },
  { id: 4, name: 'Minimalist Watch', description: 'Slim profile stainless steel watch with sapphire crystal. Japanese quartz movement.', price: 299.00, stock: 15, categoryId: 3, imageUrl: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&h=400&fit=crop' },
  { id: 5, name: 'Running Shoes X1', description: 'Lightweight performance running shoes with responsive cushioning. Breathable mesh upper.', price: 129.99, stock: 88, categoryId: 4, imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop' },
  { id: 6, name: 'Smart Water Bottle', description: 'Temperature-tracking insulated bottle with LED display. Keeps drinks cold for 24h or hot for 12h.', price: 45.00, stock: 120, categoryId: 3, imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop' },
  { id: 7, name: 'Portable Bluetooth Speaker', description: '360° immersive sound with deep bass. Waterproof and dustproof with 20-hour playtime.', price: 79.99, stock: 54, categoryId: 1, imageUrl: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop' },
  { id: 8, name: 'Canvas Tote Bag', description: 'Eco-friendly organic cotton tote with reinforced handles. Spacious interior with inner pocket.', price: 35.00, stock: 200, categoryId: 2, imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&h=400&fit=crop' },
];

const SEED_REVIEWS = [
  { productId: 1, userId: 1, rating: 5, comment: "Best headphones I've ever owned! The noise cancellation is incredible." },
  { productId: 3, userId: 1, rating: 5, comment: 'The typing experience is unmatched. Love the tactile feedback!' },
];

/**
 * Upsert the canonical category/product/review seed on startup so existing
 * databases line up with apps/web/src/data/mockData.ts without needing a
 * schema.sql re-run. Idempotent.
 */
async function ensureSeed() {
  for (const category of SEED_CATEGORIES) {
    await query(
      `INSERT INTO categories (id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             description = EXCLUDED.description`,
      [category.id, category.name, category.slug, category.description]
    );
  }
  await query(
    `SELECT setval(pg_get_serial_sequence('categories', 'id'),
                   GREATEST((SELECT MAX(id) FROM categories), 1))`
  );

  for (const product of SEED_PRODUCTS) {
    await query(
      `INSERT INTO products (id, name, description, price, stock, category_id, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             price = EXCLUDED.price,
             category_id = EXCLUDED.category_id,
             image_url = EXCLUDED.image_url,
             updated_at = NOW()`,
      [
        product.id,
        product.name,
        product.description,
        product.price,
        product.stock,
        product.categoryId,
        product.imageUrl,
      ]
    );
  }
  await query(
    `SELECT setval(pg_get_serial_sequence('products', 'id'),
                   GREATEST((SELECT MAX(id) FROM products), 1))`
  );

  for (const review of SEED_REVIEWS) {
    const existing = await query(
      'SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2 AND comment = $3',
      [review.productId, review.userId, review.comment]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO reviews (product_id, user_id, rating, comment)
         VALUES ($1, $2, $3, $4)`,
        [review.productId, review.userId, review.rating, review.comment]
      );
    }
  }
}

module.exports = { getAll, getById, search, create, update, remove, getCategories, getAllIds, ensureSeed };
