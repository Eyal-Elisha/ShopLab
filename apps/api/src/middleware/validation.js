// ============================================================
// Input Validation Middleware — using express-validator
// ============================================================
const { body, query, param, validationResult } = require('express-validator');

// Middleware to check validation results
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

const registerRules = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters').isAlphanumeric().withMessage('Username must be alphanumeric'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').optional().trim().isLength({ max: 100 }),
  body('lastName').optional().trim().isLength({ max: 100 }),
];

const loginRules = [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
];

const productRules = [
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Product name required'),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock required'),
  body('categoryId').optional().isInt(),
];

const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('comment').optional().trim().isLength({ max: 2000 }),
];

const searchRules = [
  query('q').trim().isLength({ min: 1, max: 200 }).withMessage('Search query required'),
];

module.exports = { validate, registerRules, loginRules, productRules, reviewRules, searchRules };
