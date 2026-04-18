const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json({ categories });
  } catch (err) {
    console.error('GET /api/categories error:', err);
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// POST /api/categories (admin)
router.post('/', auth, async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: 'name and slug are required' });
    }

    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(409).json({ message: 'Category with this slug already exists' });
    }

    const category = new Category({ name, slug, description: description || '' });
    await category.save();
    res.status(201).json({ category });
  } catch (err) {
    console.error('POST /api/categories error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error creating category' });
  }
});

// PUT /api/categories/:id (admin)
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const { name, slug, description } = req.body;
    if (name !== undefined) category.name = name;
    if (slug !== undefined) category.slug = slug;
    if (description !== undefined) category.description = description;

    await category.save();
    res.json({ category });
  } catch (err) {
    console.error('PUT /api/categories/:id error:', err);
    res.status(500).json({ message: 'Server error updating category' });
  }
});

// DELETE /api/categories/:id (admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(500).json({ message: 'Server error deleting category' });
  }
});

module.exports = router;
