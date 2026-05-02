const productService = require('../../services/productService');
const userService = require('../../services/userService');

const FLAG = 'SHOPLAB{created_by_property_pwns_admin_preview}';
const FLAG_ENDPOINT = '/api/admin/object-property-flag';
const leaksByProductId = new Map();
const attemptsByProductId = new Map();

async function createProduct(body, tokenFingerprint) {
  const claimedUserId = body.userId;
  if (!claimedUserId) {
    return { status: 403, error: 'Admin creator id required' };
  }

  const claimedUser = await userService.findById(claimedUserId);
  if (!claimedUser || claimedUser.role !== 'admin') {
    return { status: 403, error: 'Only admins can create products' };
  }

  const product = await productService.create({ ...body, createdBy: claimedUserId });
  attemptsByProductId.set(String(product.id), tokenFingerprint);
  return { status: 201, product };
}

function saveLeak(body, tokenFingerprint) {
  const productId = body.productId || body.product_id;
  if (!productId) return false;
  if (attemptsByProductId.get(String(productId)) !== tokenFingerprint) return false;

  leaksByProductId.set(String(productId), {
    flag: body.flag || body.value || null,
    productId,
    tokenFingerprint,
    receivedAt: new Date().toISOString(),
  });
  return true;
}

function getLeak(productId, tokenFingerprint) {
  const leak = productId ? leaksByProductId.get(String(productId)) || null : null;
  const allowedLeak = leak?.tokenFingerprint === tokenFingerprint ? leak : null;
  return {
    leak: allowedLeak,
    hint: allowedLeak ? 'Submit the leaked flag on the Challenges page.' : 'No leak found for that product yet.',
  };
}

async function runAdminPreview(tokenFingerprint) {
  const products = await productService.getAll({ limit: 200, offset: 0 });
  const armedProduct = products.find((product) => {
    const imageUrl = String(product.image_url || '');
    return attemptsByProductId.get(String(product.id)) === tokenFingerprint && imageUrl.includes(FLAG_ENDPOINT);
  });

  if (armedProduct) {
    leaksByProductId.set(String(armedProduct.id), {
      flag: FLAG,
      productId: armedProduct.id,
      tokenFingerprint,
      receivedAt: new Date().toISOString(),
    });
    await productService.remove(armedProduct.id);
  }

  return {
    reviewed: products.length,
    triggered: Boolean(armedProduct),
    deletedProductId: armedProduct?.id || null,
  };
}

module.exports = {
  FLAG,
  createProduct,
  saveLeak,
  getLeak,
  runAdminPreview,
};
