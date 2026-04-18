const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const { optionalAuth } = require('../middleware/auth');

const getCart = async (userId, guestSessionId) => {
  if (userId) return Cart.findOne({ userId });
  if (guestSessionId) return Cart.findOne({ guestSessionId });
  return null;
};

const populateCart = async (cart) => {
  if (!cart) return null;
  await cart.populate([
    { path: 'items.productId', select: 'name images price isActive' },
    { path: 'items.variantId', select: 'size color stock priceModifier' }
  ]);
  return cart;
};

const computeTotal = (items) => {
  return items.reduce((sum, item) => {
    const base = item.priceAtAdd || 0;
    return sum + base * item.quantity;
  }, 0);
};

// GET /api/cart
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const guestSessionId = req.headers['x-guest-session-id'] || null;

    let cart = await getCart(userId, guestSessionId);
    if (!cart) return res.json({ cart: null, items: [], total: 0 });

    await populateCart(cart);
    const total = computeTotal(cart.items);
    res.json({ cart, items: cart.items, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/cart/items
router.post('/items', optionalAuth, async (req, res) => {
  try {
    const { productId, variantId, quantity = 1 } = req.body;
    if (!productId) return res.status(400).json({ message: 'Product ID is required' });

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let priceAtAdd = product.price;
    if (variantId) {
      const variant = await ProductVariant.findById(variantId);
      if (!variant || !variant.isActive) {
        return res.status(404).json({ message: 'Variant not found' });
      }
      if (variant.stock < quantity) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }
      priceAtAdd = product.price + (variant.priceModifier || 0);
    }

    const userId = req.user ? req.user._id : null;
    const guestSessionId = req.headers['x-guest-session-id'] || null;

    if (!userId && !guestSessionId) {
      return res.status(400).json({ message: 'User or guest session required' });
    }

    let cart = await getCart(userId, guestSessionId);
    if (!cart) {
      cart = new Cart({ userId, guestSessionId, items: [] });
    }

    const existingIdx = cart.items.findIndex(
      (i) => i.productId.toString() === productId && (!variantId || (i.variantId && i.variantId.toString() === variantId))
    );

    if (existingIdx > -1) {
      cart.items[existingIdx].quantity += parseInt(quantity);
    } else {
      cart.items.push({ productId, variantId: variantId || undefined, quantity: parseInt(quantity), priceAtAdd });
    }

    await cart.save();
    await populateCart(cart);
    const total = computeTotal(cart.items);
    res.status(201).json({ cart, items: cart.items, total });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid ID format' });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/cart/items/:itemId
router.put('/items/:itemId', optionalAuth, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const userId = req.user ? req.user._id : null;
    const guestSessionId = req.headers['x-guest-session-id'] || null;
    const cart = await getCart(userId, guestSessionId);
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    item.quantity = parseInt(quantity);
    await cart.save();
    await populateCart(cart);
    const total = computeTotal(cart.items);
    res.json({ cart, items: cart.items, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/cart/items/:itemId
router.delete('/items/:itemId', optionalAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const guestSessionId = req.headers['x-guest-session-id'] || null;
    const cart = await getCart(userId, guestSessionId);
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    item.deleteOne();
    await cart.save();
    await populateCart(cart);
    const total = computeTotal(cart.items);
    res.json({ cart, items: cart.items, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
