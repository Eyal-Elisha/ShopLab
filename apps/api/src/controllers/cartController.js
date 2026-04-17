const cartService = require('../services/cartService');

async function getCart(req, res, next) {
  try {
    const items = await cartService.getCart(req.user.id);
    res.json({ items });
  } catch (err) { next(err); }
}
async function addItem(req, res, next) {
  try {
    const item = await cartService.addItem(req.user.id, req.body.productId, req.body.quantity || 1);
    res.status(201).json({ item });
  } catch (err) { next(err); }
}
async function updateItem(req, res, next) {
  try {
    const item = await cartService.updateQuantity(req.user.id, req.params.productId, req.body.quantity);
    res.json({ item });
  } catch (err) { next(err); }
}
async function removeItem(req, res, next) {
  try {
    await cartService.removeItem(req.user.id, req.params.productId);
    res.json({ message: 'Item removed' });
  } catch (err) { next(err); }
}

module.exports = { getCart, addItem, updateItem, removeItem };
