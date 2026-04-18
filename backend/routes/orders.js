const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const { protect, optionalAuth } = require('../middleware/auth');

// POST /api/orders
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { items, shippingAddress, shippingMethod, paymentMethod, guestEmail } = req.body;

    if (!items || !items.length) return res.status(400).json({ message: 'Order items are required' });
    if (!shippingAddress) return res.status(400).json({ message: 'Shipping address is required' });
    if (!paymentMethod) return res.status(400).json({ message: 'Payment method is required' });

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return res.status(400).json({ message: `Product not found: ${item.productId}` });
      }

      let unitPrice = product.price;
      let size, color;

      if (item.variantId) {
        const variant = await ProductVariant.findById(item.variantId);
        if (!variant || !variant.isActive) {
          return res.status(400).json({ message: `Variant not found: ${item.variantId}` });
        }
        if (variant.stock < item.quantity) {
          return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
        }
        unitPrice = product.price + (variant.priceModifier || 0);
        size = variant.size;
        color = variant.color;

        // Decrement stock
        variant.stock -= item.quantity;
        await variant.save();
      }

      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product._id,
        variantId: item.variantId || undefined,
        name: product.name,
        image: product.images && product.images[0] ? product.images[0].url : undefined,
        size,
        color,
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal
      });
    }

    const shippingCost = req.body.shippingCost || 0;
    const tax = req.body.tax || 0;
    const total = subtotal + shippingCost + tax;

    const order = await Order.create({
      userId: req.user ? req.user._id : undefined,
      guestEmail: req.user ? undefined : guestEmail,
      items: orderItems,
      subtotal,
      shippingCost,
      tax,
      total,
      shippingAddress,
      shippingMethod,
      paymentMethod
    });

    res.status(201).json({ order });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/orders (authenticated user order history)
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/orders/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Allow access if authenticated user owns it, or guest (no userId on order)
    if (req.user && order.userId && order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ order, items: order.items, tracking: order.tracking });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ message: 'Order not found' });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
