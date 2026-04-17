const { query } = require('./db');

const ADMIN_PROMO_KEY = 'phantom-checkout-key-2026';

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      discount_percent INTEGER NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
      internal_note TEXT,
      admin_promo_key VARCHAR(100),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_notes TEXT
  `);

  const existing = await query(`SELECT id FROM coupons WHERE code = 'SHOPLAB-INTERNAL-2026'`);
  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO coupons (code, discount_percent, internal_note, admin_promo_key) VALUES
       ('WELCOME10', 10, 'Public welcome coupon for new customers', NULL),
       ('SHOPLAB-INTERNAL-2026', 100, 'Internal staff testing coupon — do not distribute', $1)
       ON CONFLICT (code) DO NOTHING`,
      [ADMIN_PROMO_KEY]
    );
  }

  const existingOrder = await query(`SELECT id FROM orders WHERE staff_notes IS NOT NULL LIMIT 1`);
  if (existingOrder.rows.length === 0) {
    const orderResult = await query(
      `INSERT INTO orders (user_id, total, status, shipping_address, staff_notes)
       VALUES (1, 0.00, 'delivered', '1 ShopLab Way, Test City, TC 00000',
               'Fulfillment: apply coupon SHOPLAB-INTERNAL-2026 for internal QA. Do not ship — test order only.')
       RETURNING id`
    );
    const orderId = orderResult.rows[0].id;
    await query(
      `INSERT INTO order_items (order_id, product_id, quantity, price_at_time)
       VALUES ($1, 1, 1, 0.00)`,
      [orderId]
    );
  }
}

async function findByCode(code) {
  const result = await query('SELECT * FROM coupons WHERE code = $1 AND active = true', [code]);
  return result.rows[0] || null;
}

async function validatePromoKey(promoKey) {
  const result = await query(
    'SELECT id FROM coupons WHERE admin_promo_key = $1 AND active = true',
    [promoKey]
  );
  return result.rows.length > 0;
}

module.exports = { ensureTables, findByCode, validatePromoKey, ADMIN_PROMO_KEY };
