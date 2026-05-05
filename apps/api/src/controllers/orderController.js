const orderService = require('../services/orderService');
const cartService = require('../services/cartService');
const productService = require('../services/productService');

async function myOrders(req, res, next) {
  try {
    const orders = await orderService.getByUserId(req.user.id);
    res.json({ orders });
  } catch (err) { next(err); }
}

async function getOrder(req, res, next) {
  try {
    const order = await orderService.getById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ order });
  } catch (err) { next(err); }
}

async function checkout(req, res, next) {
  try {
    const { shippingAddress, items } = req.body;

    // Direct checkout path: the storefront cart lives in the browser's
    // localStorage, so it posts its items here rather than syncing to
    // cart_items first. Prices are re-read from the DB inside the service.
    if (Array.isArray(items) && items.length > 0) {
      const order = await orderService.createFromItems(req.user.id, shippingAddress, items);
      
      let flag = undefined;
      let message = 'Order placed successfully';
      
      // VULNERABILITY CHECK: Insecure Design (Price Manipulation)
      for (const item of items) {
        if (item.price !== undefined && Number(item.price) <= 1) {
          const product = await productService.getById(item.productId);
          if (product && Number(product.price) > 200) {
            flag = 'SHOPLAB{pr1c3_t4g_sw4p_ins3cur3_d3sign}';
            message = 'Order placed successfully. Wait, did you just change the price tag?';
            
            // Save the flag to the order so it appears in the receipt UI
            await orderService.updateStatus(order.id, 'delivered');
            await orderService.updateStaffNotes(order.id, `FLAG: ${flag}`);
            break;
          }
        }
      }
      
      return res.status(201).json({ order, message, flag });
    }

    const cartItems = await cartService.getCart(req.user.id);
    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const order = await orderService.create(req.user.id, shippingAddress, cartItems);
    res.status(201).json({ order, message: 'Order placed successfully' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/orders/:id/receipt
 *
 * VULNERABILITY: Insecure Direct Object Reference (IDOR).
 * Returns full order receipt including staff_notes without
 * verifying that the requesting user owns the order.
 */
async function getReceipt(req, res, next) {
  try {
    const order = await orderService.getReceipt(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({
      receipt: {
        orderId: order.id,
        date: order.created_at,
        status: order.status,
        items: order.items,
        total: order.total,
        shippingAddress: order.shipping_address,
        staffNotes: order.staff_notes,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { myOrders, getOrder, getReceipt, checkout };
