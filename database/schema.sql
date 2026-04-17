-- ============================================================
-- ShopLab — Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User roles table (separate from users for security)
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    UNIQUE(user_id, role)
);

-- Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category_id INTEGER REFERENCES categories(id),
    image_url VARCHAR(500),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product reviews
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Shopping cart
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
    shipping_address TEXT,
    staff_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id INTEGER REFERENCES products(id) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_time DECIMAL(10,2) NOT NULL
);

-- Coupons (used by the Broken Access Control challenge)
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    internal_note TEXT,
    admin_promo_key VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Challenge progress
-- Challenge definitions live in the application registry under apps/api/src/challenges/.
-- The database only stores per-user progress.
CREATE TABLE user_challenge_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    challenge_slug VARCHAR(100) NOT NULL,
    solved_at TIMESTAMP,
    last_attempt_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, challenge_slug)
);

-- Seed categories (kept in sync with apps/web/src/data/mockData.ts)
INSERT INTO categories (id, name, slug, description) VALUES
(1, 'Electronics', 'electronics', 'Gadgets, devices, and tech accessories'),
(2, 'Bags', 'bags', 'Backpacks, totes, and carry essentials'),
(3, 'Accessories', 'accessories', 'Watches, bottles, and everyday accessories'),
(4, 'Footwear', 'footwear', 'Shoes and sneakers');
SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT MAX(id) FROM categories));

-- Seed a default admin user (password: admin123 — bcrypt hash)
-- You should change this in production
INSERT INTO users (username, email, password_hash, first_name, last_name)
VALUES ('admin', 'admin@shop.local', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Admin', 'User');

INSERT INTO user_roles (user_id, role) VALUES (1, 'admin');

-- Seed storefront products (ids match apps/web/src/data/mockData.ts)
INSERT INTO products (id, name, description, price, stock, category_id, image_url, created_by) VALUES
(1, 'Stealth Wireless Headphones', 'Premium noise-cancelling wireless headphones with 40-hour battery life. Crystal-clear audio with deep bass response.', 249.99, 45, 1, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', 1),
(2, 'Vintage Leather Backpack', 'Handcrafted genuine leather backpack with laptop compartment. Perfect for daily commute or weekend adventures.', 189.00, 22, 2, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop', 1),
(3, 'Mechanical Keyboard Pro', 'RGB mechanical keyboard with Cherry MX switches. Hot-swappable keys and aluminum body.', 159.99, 67, 1, 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop', 1),
(4, 'Minimalist Watch', 'Slim profile stainless steel watch with sapphire crystal. Japanese quartz movement.', 299.00, 15, 3, 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&h=400&fit=crop', 1),
(5, 'Running Shoes X1', 'Lightweight performance running shoes with responsive cushioning. Breathable mesh upper.', 129.99, 88, 4, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop', 1),
(6, 'Smart Water Bottle', 'Temperature-tracking insulated bottle with LED display. Keeps drinks cold for 24h or hot for 12h.', 45.00, 120, 3, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop', 1),
(7, 'Portable Bluetooth Speaker', '360° immersive sound with deep bass. Waterproof and dustproof with 20-hour playtime.', 79.99, 54, 1, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop', 1),
(8, 'Canvas Tote Bag', 'Eco-friendly organic cotton tote with reinforced handles. Spacious interior with inner pocket.', 35.00, 200, 2, 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&h=400&fit=crop', 1);
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT MAX(id) FROM products));

-- Seed the two demo reviews (kept in sync with mockData.ts)
INSERT INTO reviews (product_id, user_id, rating, comment) VALUES
(1, 1, 5, 'Best headphones I''ve ever owned! The noise cancellation is incredible.'),
(3, 1, 5, 'The typing experience is unmatched. Love the tactile feedback!');

-- Seed coupons (Broken Access Control challenge)
INSERT INTO coupons (code, discount_percent, internal_note, admin_promo_key) VALUES
('WELCOME10', 10, 'Public welcome coupon for new customers', NULL),
('SHOPLAB-INTERNAL-2026', 100, 'Internal staff testing coupon — do not distribute', 'phantom-checkout-key-2026');

-- Seed an internal test order by admin (contains the coupon code in staff_notes)
INSERT INTO orders (user_id, total, status, shipping_address, staff_notes) VALUES
(1, 0.00, 'delivered', '1 ShopLab Way, Test City, TC 00000',
 'Fulfillment: apply coupon SHOPLAB-INTERNAL-2026 for internal QA. Do not ship — test order only.');

INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES
(1, 1, 1, 0.00);
