const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const authMiddleware = require('../middleware/auth');

// Helper: resolve cart filter from request (auth user or guest session)
function getCartFilter(req) {
  if (req.user && req.user.id) {
    return { userId: req.user.id };
  }
  const guestSessionId = req.headers['x-guest-session-id'] || req.query.guestSessionId;
  if (guestSessionId) {
    return { guestSessionId };
  }
  return null;
}

// Helper: populate cart items with product and variant details
async function buildCartResponse(cart) {
  const populatedItems = await Promise.all(
    cart.items.map(async (item) => {
      const product = await Product.findById(item.productId).select('name price images category').lean();
      let variant = null;
      if (item.variantId) {
        variant = await ProductVariant.findById(item.variantId).select('size color techSpecs stock').lean();
      }
      const unitPrice = product ? product.price : 0;
      return {
        id: item._id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        product: product || null,
        variant: variant || null,
        unitPrice,
        subtotal: unitPrice * item.quantity
      };
    })
  );

  const total = populatedItems.reduce((sum, i) => sum + i.subtotal, 0);

  return {
    cart: {
      id: cart._id,
      userId: cart.userId,
      guestSessionId: cart.guestSessionId
    },
    items: populatedItems,
    total: Math.round(total * 100) / 100
  };
}

// Optional auth — attaches user if token present but does not block guests
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();
  authMiddleware(req, res, next);
}

// GET /api/cart
router.get('/', optionalAuth, async (req, res) => {
  try {
    const filter = getCartFilter(req);
    if (!filter) {
      return res.status(400).json({ error: 'No user session or guest session ID provided' });
    }

    let cart = await Cart.findOne(filter);
    if (!cart) {
      // Return empty cart
      return res.json({ cart: { id: null, userId: filter.userId || null, guestSessionId: filter.guestSessionId || null }, items: [], total: 0 });
    }

    const response = await buildCartResponse(cart);
    return res.json(response);
  } catch (err) {
    console.error('GET /api/cart error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/cart/items
router.post('/items', optionalAuth, async (req, res) => {
  try {
    const filter = getCartFilter(req);
    if (!filter) {
      return res.status(400).json({ error: 'No user session or guest session ID provided' });
    }

    const { productId, variantId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate variant if provided
    if (variantId) {
      const variant = await ProductVariant.findOne({ _id: variantId, productId });
      if (!variant) {
        return res.status(404).json({ error: 'Product variant not found' });
      }
      if (variant.stock < qty) {
        return res.status(400).json({ error: 'Insufficient stock for requested quantity' });
      }
    }

    let cart = await Cart.findOne(filter);
    if (!cart) {
      cart = new Cart({
        userId: filter.userId || null,
        guestSessionId: filter.guestSessionId || null,
        items: []
      });
    }

    // Check if same product+variant already in cart
    const existingIndex = cart.items.findIndex(
      (i) =>
        i.productId.toString() === productId.toString() &&
        (variantId ? i.variantId && i.variantId.toString() === variantId.toString() : !i.variantId)
    );

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += qty;
    } else {
      cart.items.push({
        productId,
        variantId: variantId || null,
        quantity: qty
      });
    }

    await cart.save();
    const response = await buildCartResponse(cart);
    return res.status(201).json(response);
  } catch (err) {
    console.error('POST /api/cart/items error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/cart/items/:itemId
router.put('/items/:itemId', optionalAuth, async (req, res) => {
  try {
    const filter = getCartFilter(req);
    if (!filter) {
      return res.status(400).json({ error: 'No user session or guest session ID provided' });
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const cart = await Cart.findOne(filter);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Validate stock if variant present
    if (item.variantId) {
      const variant = await ProductVariant.findById(item.variantId);
      if (variant && variant.stock < qty) {
        return res.status(400).json({ error: 'Insufficient stock for requested quantity' });
      }
    }

    item.quantity = qty;
    await cart.save();

    const response = await buildCartResponse(cart);
    return res.json(response);
  } catch (err) {
    console.error('PUT /api/cart/items/:itemId error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/cart/items/:itemId
router.delete('/items/:itemId', optionalAuth, async (req, res) => {
  try {
    const filter = getCartFilter(req);
    if (!filter) {
      return res.status(400).json({ error: 'No user session or guest session ID provided' });
    }

    const { itemId } = req.params;

    const cart = await Cart.findOne(filter);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    item.deleteOne();
    await cart.save();

    const response = await buildCartResponse(cart);
    return res.json(response);
  } catch (err) {
    console.error('DELETE /api/cart/items/:itemId error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
