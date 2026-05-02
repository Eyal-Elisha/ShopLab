const productService = require('../../services/productService');

const FLAG = 'SHOPLAB{BFLA_METHOD_SWAP_SUCCESS}';
const HINT = 'This is the secret product!';
let activeProductId = null;

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

async function ensureActiveProductId() {
  if (activeProductId !== null) {
    const exists = await productService.getById(activeProductId);
    if (exists) return activeProductId;
  }

  activeProductId = randomItem(await productService.getAllIds());
  return activeProductId;
}

async function applyHint(product) {
  const challengeProductId = await ensureActiveProductId();
  if (Number(product.id) === Number(challengeProductId)) {
    product.internal_access_hint = HINT;
  }
  return product;
}

async function buildFlagSwap(existing, requestedName) {
  const challengeProductId = await ensureActiveProductId();
  if (Number(existing.id) !== Number(challengeProductId) || requestedName !== 'Eval') {
    return null;
  }

  return {
    message: `Only admins should be able to change product names... Well! Here's your flag:`,
    product: { ...existing, name: FLAG },
  };
}

async function rotateAfterDelete(deletedId) {
  if (activeProductId === null || Number(deletedId) !== Number(activeProductId)) return;
  const ids = await productService.getAllIds();
  activeProductId = randomItem(ids.filter((id) => Number(id) !== Number(deletedId)));
}

module.exports = { applyHint, buildFlagSwap, rotateAfterDelete };
