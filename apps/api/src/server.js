// ============================================================
// ShopLab — Express Server
// ============================================================
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { requestLogger } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const challengeProgressService = require("./services/challengeProgressService");
const couponService = require("./services/couponService");
const productService = require("./services/productService");

const app = express();
const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.server.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
};

// ── Core Middleware ──────────────────────────────────────────
// `contentSecurityPolicy` disabled so the built SPA bundle can load inline
// scripts/styles in production mode (helmet's default CSP is too strict for
// Vite's output without a custom config).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/account', require('./routes/account'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/hints', require('./routes/hints'));
app.use('/api/support-chat', require('./routes/supportChat'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API index — intentionally public. Realistic APIs often expose a root
// catalog for discovery, and ShopLab does the same. Attackers and
// onboarding engineers alike can use this to map the surface.
app.get('/api', (req, res) => {
  res.json({
    service: 'ShopLab API',
    version: '1.0.0',
    docs: 'https://example.invalid/docs', // placeholder
    endpoints: {
      auth:       ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/auth/profile'],
      user:       ['GET /api/user/me', 'PUT /api/user/me', 'PUT /api/user/me/password'],
      users:      ['GET /api/users/:userId/profile'],
      products:   ['GET /api/products', 'GET /api/products/:id', 'GET /api/products/:id/reviews', 'POST /api/products/:id/reviews'],
      orders:     ['GET /api/orders', 'GET /api/orders/:id', 'POST /api/orders/checkout', 'GET /api/orders/:id/receipt'],
      cart:       ['GET /api/cart', 'POST /api/cart/add', 'DELETE /api/cart/:itemId'],
      account:    ['PATCH /api/account/settings'],
      coupons:    ['POST /api/coupons/apply'],
      admin:      ['GET /api/admin/dashboard', 'PUT /api/admin/users/:userId/role', 'DELETE /api/admin/users/:userId', 'PATCH /api/admin/products/:productId', 'DELETE /api/admin/products/:productId', 'GET /api/admin/flag'],
      challenges: ['GET /api/challenges', 'POST /api/challenges/solve', 'GET /api/hints/:slug'],
      supportChat: ['POST /api/support-chat'],
      health:     ['GET /api/health'],
    },
  });
});

// ── Static frontend (single-port deploy) ────────────────────
// When the built frontend is present at apps/web/dist, serve it from the
// same Express port so there is exactly one URL to hand to a player.
// In dev, the Vite server handles the UI on a separate port and this
// block is a no-op.
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`[SERVER] Serving built frontend from ${webDist}`);
}

// ── Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────
async function start() {
  await productService.ensureSeed();
  await challengeProgressService.ensureTable();
  await couponService.ensureTables();
  app.listen(config.server.port, () => {
    console.log(`[SERVER] Running on http://localhost:${config.server.port} (${config.server.env})`);
  });
}

start().catch((error) => {
  console.error("[SERVER] Failed to start", error);
  process.exit(1);
});
