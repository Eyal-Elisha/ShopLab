const couponService = require('../services/couponService');

/**
 * POST /api/coupons/apply
 *
 * VULNERABILITY: Missing function-level access control.
 * This endpoint was intended for staff only but has no role check.
 * A valid internal coupon code returns verbose debug info including
 * an admin promo key that should never be exposed to regular users.
 */
async function apply(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const coupon = await couponService.findByCode(code.toUpperCase().trim());
    if (!coupon) {
      return res.status(404).json({ valid: false, message: 'Invalid or expired coupon code' });
    }

    const response = {
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discount_percent,
      message: `Coupon applied — ${coupon.discount_percent}% discount`,
    };

    if (coupon.internal_note || coupon.admin_promo_key) {
      response.debug = {};
      if (coupon.internal_note) {
        response.debug.internalNote = coupon.internal_note;
      }
      if (coupon.admin_promo_key) {
        response.debug.adminPromoKey = coupon.admin_promo_key;
      }
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
}

module.exports = { apply };
