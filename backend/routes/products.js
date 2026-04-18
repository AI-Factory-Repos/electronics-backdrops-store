const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 12 } = req.query;
    const filter = { isActive: true };

    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ products, totalPages, total, page: parseInt(page) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug');
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variants = await ProductVariant.find({ productId: product._id, isActive: true });
    res.json({ product, variants });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ message: 'Product not found' });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/products (admin)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, price, category, variants, images, ...rest } = req.body;

    const product = await Product.create({ name, description, price, category, images, ...rest });

    let createdVariants = [];
    if (variants && variants.length > 0) {
      const variantsWithProduct = variants.map(v => ({ ...v, productId: product._id }));
      createdVariants = await ProductVariant.insertMany(variantsWithProduct);
    }

    res.status(201).json({ product, variants: createdVariants });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
