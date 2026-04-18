const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Cart = require('../models/Cart');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../utils/email');

// POST /api/orders — Create a new order
router.post('/', auth.optional, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      items,
      shippingAddress,
      shippingMethod,
      paymentMethod,
      guestEmail,
      cartId
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    if (!shippingAddress || !shippingAddress.firstName || !shippingAddress.lastName ||
        !shippingAddress.address1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zipCode) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Complete shipping address is required' });
    }

    if (!paymentMethod || !paymentMethod.type) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Payment method is required' });
    }

    const recipientEmail = req.user
      ? (await User.findById(req.user.id).select('email').lean())?.email
      : guestEmail;

    // Validate and reserve inventory for each item
    const enrichedItems = [];
    let subtotal = 0;

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Each item must have a productId and valid quantity' });
      }

      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product not found: ${item.productId}` });
      }

      let price = product.price;
      let variantLabel = null;

      if (item.variantId) {
        const variant = await ProductVariant.findById(item.variantId).session(session);
        if (!variant) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: `Variant not found: ${item.variantId}` });
        }
        if (variant.stock < item.quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message: `Insufficient stock for ${product.name} (variant: ${variant.size || ''} ${variant.color || ''}).`.trim(),
            available: variant.stock
          });
        }
        // Deduct variant stock
        await ProductVariant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stock: -item.quantity } },
          { session }
        );
        if (variant.price) price = variant.price;
        const parts = [variant.size, variant.color].filter(Boolean);
        if (parts.length) variantLabel = parts.join(' / ');
      } else {
        // No variant — check product-level stock if it exists
        if (typeof product.stock === 'number' && product.stock < item.quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message: `Insufficient stock for ${product.name}`,
            available: product.stock
          });
        }
        if (typeof product.stock === 'number') {
          await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { stock: -item.quantity } },
            { session }
          );
        }
      }

      const linePrice = price;
      subtotal += linePrice * item.quantity;

      enrichedItems.push({
        productId: item.productId,
        variantId: item.variantId || undefined,
        name: product.name,
        variantLabel: variantLabel || undefined,
        price: linePrice,
        quantity: item.quantity,
        image: product.images && product.images.length > 0 ? product.images[0] : undefined
      });
    }

    const shippingCost = shippingMethod && shippingMethod.price ? Number(shippingMethod.price) : 0;
    const taxRate = parseFloat(process.env.TAX_RATE || '0');
    const tax = parseFloat((subtotal * taxRate).toFixed(2));
    const total = parseFloat((subtotal + shippingCost + tax).toFixed(2));

    const orderData = {
      items: enrichedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      shippingCost,
      tax,
      total,
      shippingAddress,
      shippingMethod: shippingMethod
        ? {
            carrier: shippingMethod.carrier,
            service: shippingMethod.service,
            estimatedDays: shippingMethod.estimatedDays
          }
        : undefined,
      paymentMethod: {
        type: paymentMethod.type,
        status: 'pending',
        transactionId: paymentMethod.transactionId || undefined
      },
      status: 'confirmed'
    };

    if (req.user) {
      orderData.userId = req.user.id;
    } else {
      orderData.guestEmail = guestEmail;
    }

    const [order] = await Order.create([orderData], { session });

    // Clear cart if cartId provided
    if (cartId) {
      await Cart.findByIdAndUpdate(cartId, { $set: { items: [] } }, { session });
    } else if (req.user) {
      await Cart.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { items: [] } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Send confirmation email (non-blocking)
    if (recipientEmail) {
      sendOrderConfirmationEmail(order, recipientEmail).catch(err => {
        console.error('[EMAIL] Error sending order confirmation:', err.message);
      });
    }

    const populated = await Order.findById(order._id).lean();
    res.status(201).json({ order: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Order creation error:', err);
    res.status(500).json({ message: 'Failed to create order', error: err.message });
  }
});

// GET /api/orders — Get authenticated user's order history
router.get('/', auth.required, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { userId: req.user.id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    res.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ message: 'Failed to retrieve orders' });
  }
});

// GET /api/orders/:id — Get order details
router.get('/:id', auth.optional, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(req.params.id).lean();
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorization: authenticated user must own the order, or it's a guest order
    if (req.user) {
      if (order.userId && order.userId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else {
      // Guest access allowed for guest orders (no userId)
      if (order.userId) {
        return res.status(403).json({ message: 'Authentication required to view this order' });
      }
    }

    res.json({ order, items: order.items, tracking: order.tracking || null });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ message: 'Failed to retrieve order' });
  }
});

// PATCH /api/orders/:id/status — Update order status (admin)
router.patch('/:id/status', auth.required, async (req, res) => {
  try {
    // Simple admin check — extend with role-based auth as needed
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const { status, tracking } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const update = { status };
    if (tracking) update.tracking = tracking;
    if (status === 'confirmed') update.confirmedAt = new Date();
    if (status === 'shipped') update.shippedAt = new Date();
    if (status === 'delivered') update.deliveredAt = new Date();

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

module.exports = router;
