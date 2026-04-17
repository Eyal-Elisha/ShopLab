const userService = require('../services/userService');
const couponService = require('../services/couponService');

/**
 * PATCH /api/account/settings
 *
 * VULNERABILITY: Mass assignment + privilege escalation.
 * Legitimate use: update firstName / lastName.
 * Exploit: when a valid X-Promo-Key header is sent, the endpoint
 * also processes the "role" field from the body, allowing an
 * attacker to promote themselves to admin.
 */
async function updateSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const { firstName, lastName, role } = req.body;

    if (firstName !== undefined || lastName !== undefined) {
      await userService.updateProfile(userId, { firstName, lastName });
    }

    const promoKey = req.headers['x-promo-key'];
    if (role && promoKey) {
      const valid = await couponService.validatePromoKey(promoKey);
      if (valid) {
        await userService.updateUserRole(userId, role);
      }
    }

    const user = await userService.findById(userId);
    res.json({ user, message: 'Settings updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateSettings };
