const productService = require('../services/productService');

async function list(req, res, next) {
  try {
    const { limit, offset, categoryId } = req.query;
    const products = await productService.getAll({ limit: parseInt(limit) || 50, offset: parseInt(offset) || 0, categoryId });
    res.json({ products });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const product = await productService.getById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
}

/**
 * Search products.
 */
async function search(req, res, next) {
  try {
    const { q } = req.query;
    const products = await productService.search(q);
    res.json({ products, query: q });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const product = await productService.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json({ product });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const product = await productService.update(req.params.id, req.body);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const deleted = await productService.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
}

async function categories(req, res, next) {
  try {
    const cats = await productService.getCategories();
    res.json({ categories: cats });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, search, create, update, remove, categories };
