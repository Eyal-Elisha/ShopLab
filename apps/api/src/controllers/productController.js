const productService = require('../services/productService');
const methodSwapChallenge = require('../challenges/handlers/productMethodSwapChallenge');
const objectPropertyChallenge = require('../challenges/handlers/productObjectPropertyChallenge');
const authTokenFingerprint = require('../services/authTokenFingerprintService');

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
    res.json({ product: await methodSwapChallenge.applyHint(product) });
  } catch (err) { next(err); }
}

async function search(req, res, next) {
  try {
    const { q } = req.query;
    const products = await productService.search(q);
    res.json({ products, query: q });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const result = await objectPropertyChallenge.createProduct(req.body, authTokenFingerprint.fromRequest(req));
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).json({ product: result.product });
  } catch (err) { next(err); }
}

async function saveLeak(req, res) { res.status(201).json({ ok: objectPropertyChallenge.saveLeak(req.body, authTokenFingerprint.fromRequest(req)) }); }

async function getLeak(req, res) { res.json(objectPropertyChallenge.getLeak(req.query.productId, authTokenFingerprint.fromRequest(req))); }

async function runAdminPreview(req, res, next) {
  try {
    res.json(await objectPropertyChallenge.runAdminPreview(authTokenFingerprint.fromRequest(req)));
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const existing = await productService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const requestedName = req.body.name;
    const flagSwap = await methodSwapChallenge.buildFlagSwap(existing, requestedName);
    if (flagSwap) return res.json(flagSwap);

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
    await methodSwapChallenge.rotateAfterDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
}

async function categories(req, res, next) {
  try {
    const cats = await productService.getCategories();
    res.json({ categories: cats });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, search, create, update, remove, categories, saveLeak, getLeak, runAdminPreview };
