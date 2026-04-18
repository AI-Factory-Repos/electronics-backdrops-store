const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Category = require('../models/Category');
const auth = require('../middleware/auth');

// Multer storage configuration
const uploadDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// GET /api/products — list with filters, search, pagination
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 12, featured, minPrice, maxPrice, sort } = req.query;

    const query = { isActive: true };

    if (category) {
      // Support category by slug or id
      if (mongoose.Types.ObjectId.isValid(category)) {
        query.category = category;
      } else {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
          query.category = cat._id;
        } else {
          return res.json({ products: [], totalPages: 0, total: 0, page: parseInt(page) });
        }
      }
    }

    if (search) {
      query.$text = { $search: search };
    }

    if (featured === 'true') {
      query.featured = true;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) query.price.$lte = parseFloat(maxPrice);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let sortOption = { createdAt: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'name_asc') sortOption = { name: 1 };
    else if (sort === 'name_desc') sortOption = { name: -1 };
    else if (search) sortOption = { score: { $meta: 'textScore' }, createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    // Attach variant counts
    const productIds = products.map(p => p._id);
    const variantCounts = await ProductVariant.aggregate([
      { $match: { productId: { $in: productIds } } },
      { $group: { _id: '$productId', count: { $sum: 1 }, totalStock: { $sum: '$stock' } } }
    ]);
    const variantMap = {};
    variantCounts.forEach(v => { variantMap[v._id.toString()] = v; });

    const enrichedProducts = products.map(p => ({
      ...p,
      variantCount: variantMap[p._id.toString()]?.count || 0,
      totalStock: variantMap[p._id.toString()]?.totalStock || 0
    }));

    res.json({
      products: enrichedProducts,
      total,
      totalPages: Math.ceil(total / limitNum),
      page: pageNum
    });
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ message: 'Server error fetching products' });
  }
});

// GET /api/products/:id — single product with variants
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = await Product.findById(id).populate('category', 'name slug').lean();
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variants = await ProductVariant.find({ productId: id }).lean();

    res.json({ product, variants });
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ message: 'Server error fetching product' });
  }
});

// POST /api/products — create product (admin)
router.post('/', auth, upload.array('images', 10), async (req, res) => {
  try {
    const { name, description, price, category, featured, tags, variants } = req.body;

    if (!name || !description || price === undefined || !category) {
      return res.status(400).json({ message: 'name, description, price, and category are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Invalid category id' });
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: 'Category not found' });
    }

    // Handle uploaded images
    const imageUrls = req.files ? req.files.map(f => `/uploads/products/${f.filename}`) : [];

    // Also accept image URLs passed in body
    let bodyImages = [];
    if (req.body.images) {
      bodyImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    const product = new Product({
      name,
      description,
      price: parseFloat(price),
      category,
      images: [...bodyImages, ...imageUrls],
      featured: featured === true || featured === 'true',
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : []
    });

    await product.save();

    // Handle variants
    let savedVariants = [];
    if (variants) {
      const variantList = typeof variants === 'string' ? JSON.parse(variants) : variants;
      if (Array.isArray(variantList) && variantList.length > 0) {
        const variantDocs = variantList.map(v => ({
          productId: product._id,
          size: v.size || '',
          color: v.color || '',
          techSpecs: v.techSpecs || {},
          stock: v.stock !== undefined ? parseInt(v.stock) : 0,
          sku: v.sku || '',
          priceModifier: v.priceModifier !== undefined ? parseFloat(v.priceModifier) : 0
        }));
        savedVariants = await ProductVariant.insertMany(variantDocs);
      }
    }

    const populated = await product.populate('category', 'name slug');

    res.status(201).json({ product: populated, variants: savedVariants });
  } catch (err) {
    console.error('POST /api/products error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error creating product' });
  }
});

// PUT /api/products/:id — update product (admin)
router.put('/:id', auth, upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { name, description, price, category, featured, tags, isActive } = req.body;

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (category !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category id' });
      }
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) return res.status(400).json({ message: 'Category not found' });
      product.category = category;
    }
    if (featured !== undefined) product.featured = featured === true || featured === 'true';
    if (isActive !== undefined) product.isActive = isActive === true || isActive === 'true';
    if (tags !== undefined) product.tags = Array.isArray(tags) ? tags : [tags];

    // New uploaded images appended
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => `/uploads/products/${f.filename}`);
      product.images = [...product.images, ...newImages];
    }

    // Replace images if provided in body
    if (req.body.images !== undefined) {
      const bodyImages = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
      const uploadedImages = req.files ? req.files.map(f => `/uploads/products/${f.filename}`) : [];
      product.images = [...bodyImages, ...uploadedImages];
    }

    await product.save();
    const populated = await product.populate('category', 'name slug');
    const variants = await ProductVariant.find({ productId: id }).lean();

    res.json({ product: populated, variants });
  } catch (err) {
    console.error('PUT /api/products/:id error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error updating product' });
  }
});

// DELETE /api/products/:id — soft delete product (admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ message: 'Server error deleting product' });
  }
});

// POST /api/products/:id/variants — add variant to product (admin)
router.post('/:id/variants', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = await Product.findById(id);
    if (!product || !product.isActive) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { size, color, techSpecs, stock, sku, priceModifier } = req.body;

    const variant = new ProductVariant({
      productId: id,
      size: size || '',
      color: color || '',
      techSpecs: techSpecs || {},
      stock: stock !== undefined ? parseInt(stock) : 0,
      sku: sku || '',
      priceModifier: priceModifier !== undefined ? parseFloat(priceModifier) : 0
    });

    await variant.save();
    res.status(201).json({ variant });
  } catch (err) {
    console.error('POST /api/products/:id/variants error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Server error creating variant' });
  }
});

// PUT /api/products/:id/variants/:variantId — update variant (admin)
router.put('/:id/variants/:variantId', auth, async (req, res) => {
  try {
    const { id, variantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(variantId)) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const variant = await ProductVariant.findOne({ _id: variantId, productId: id });
    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const { size, color, techSpecs, stock, sku, priceModifier } = req.body;

    if (size !== undefined) variant.size = size;
    if (color !== undefined) variant.color = color;
    if (techSpecs !== undefined) variant.techSpecs = techSpecs;
    if (stock !== undefined) variant.stock = parseInt(stock);
    if (sku !== undefined) variant.sku = sku;
    if (priceModifier !== undefined) variant.priceModifier = parseFloat(priceModifier);

    await variant.save();
    res.json({ variant });
  } catch (err) {
    console.error('PUT /api/products/:id/variants/:variantId error:', err);
    res.status(500).json({ message: 'Server error updating variant' });
  }
});

// DELETE /api/products/:id/variants/:variantId — delete variant (admin)
router.delete('/:id/variants/:variantId', auth, async (req, res) => {
  try {
    const { id, variantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(variantId)) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const variant = await ProductVariant.findOneAndDelete({ _id: variantId, productId: id });
    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    res.json({ message: 'Variant deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id/variants/:variantId error:', err);
    res.status(500).json({ message: 'Server error deleting variant' });
  }
});

module.exports = router;
