const userService = require('../services/userService');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const adminProductService = require('../services/adminProductService');
const adminUserService = require('../services/adminUserService');

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

async function updateProduct(req, res, next) {
  try {
    const product = await adminProductService.updateProduct(req.params.productId, req.body);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
}

async function deleteProduct(req, res, next) {
  try {
    const deleted = await adminProductService.deleteProduct(req.params.productId);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    if (Number(req.params.userId) === req.user.id) {
      return res.status(400).json({ error: 'Admins cannot delete their own account' });
    }
    const deleted = await adminUserService.deleteUser(req.params.userId);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
}

async function getFlag(req, res) {
  res.json({
    flag: 'SHOPLAB{phantom_ch3ckout_br0ken_acc3ss_ctrl}',
    message: 'You have admin access. Submit this flag on the Challenges page.',
  });
}

async function getBrokenAuthFlag(req, res) {
  res.json({
    flag: 'SHOPLAB{remember_me_is_not_auth}',
    message: 'Legacy remembered identity accepted. Submit this flag on the Challenges page.',
  });
}

module.exports = {
  index,
  dashboard,
  updateUserRole,
  updateProduct,
  deleteProduct,
  deleteUser,
  getFlag,
  getBrokenAuthFlag,
};
