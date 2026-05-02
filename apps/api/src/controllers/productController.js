const productService = require('../services/productService');
const CHALLENGE_FLAG = 'SHOPLAB{BFLA_METHOD_SWAP_SUCCESS}';
const CHALLENGE_HINT = 'This is the secret product!';
let activeChallengeProductId = null;

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

async function ensureActiveChallengeProductId() {
  if (activeChallengeProductId !== null) {
    const exists = await productService.getById(activeChallengeProductId);
    if (exists) return activeChallengeProductId;
  }
  const ids = await productService.getAllIds();
  activeChallengeProductId = randomItem(ids);
  return activeChallengeProductId;
}

async function rotateChallengeProductAfterDelete(deletedId) {
  if (activeChallengeProductId === null || Number(deletedId) !== Number(activeChallengeProductId)) return;
  const ids = await productService.getAllIds();
  activeChallengeProductId = randomItem(ids.filter((id) => Number(id) !== Number(deletedId)));
}

async function list(req, res, next) {
  try {
    const { limit, offset, categoryId } = req.query;
    const products = await productService.getAll({ limit: parseInt(limit) || 50, offset: parseInt(offset) || 0, categoryId });
    res.json({ products });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const challengeProductId = await ensureActiveChallengeProductId();
    const product = await productService.getById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (Number(product.id) === Number(challengeProductId)) {
      product.internal_access_hint = CHALLENGE_HINT;
    }
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
    const challengeProductId = await ensureActiveChallengeProductId();
    const existing = await productService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const requestedName = req.body.name;
    const shouldSwapToFlag =
      Number(existing.id) === Number(challengeProductId) &&
      requestedName === 'Eval';

    if (shouldSwapToFlag) {
      return res.json({
        message: `Only admins should be able to change product names... Well! Here's your flag:`,
        product: {
          ...existing,
          name: CHALLENGE_FLAG,
        },
      });
    }

    const payload = {
      name: requestedName !== undefined ? requestedName : existing.name,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      price: req.body.price !== undefined ? req.body.price : existing.price,
      stock: existing.stock,
      categoryId: req.body.categoryId !== undefined ? req.body.categoryId : existing.category_id,
      imageUrl: req.body.imageUrl !== undefined ? req.body.imageUrl : existing.image_url,
    };

    const product = await productService.update(req.params.id, payload);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const deleted = await productService.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    await rotateChallengeProductAfterDelete(req.params.id);
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
