const userService = require('../services/userService');
const orderService = require('../services/orderService');
const productService = require('../services/productService');

async function index(req, res) {
  res.json({
    service: 'admin',
    endpoints: [
      '/api/admin/dashboard',
      '/api/admin/users/:userId/role',
    ],
  });
}

async function dashboard(req, res, next) {
  try {
    const users = await userService.getAllUsers();
    const orders = await orderService.getAllOrders();
    const products = await productService.getAll();
    res.json({
      stats: { totalUsers: users.length, totalOrders: orders.length, totalProducts: products.length },
      users, orders, products,
    });
  } catch (err) { next(err); }
}

async function updateUserRole(req, res, next) {
  try {
    const updated = await userService.updateUserRole(req.params.userId, req.body.role);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user: updated });
  } catch (err) { next(err); }
}

async function getFlag(req, res) {
  res.json({
    flag: 'SHOPLAB{phantom_ch3ckout_br0ken_acc3ss_ctrl}',
    message: 'You have admin access. Submit this flag on the Challenges page.',
  });
}

module.exports = { index, dashboard, updateUserRole, getFlag };
