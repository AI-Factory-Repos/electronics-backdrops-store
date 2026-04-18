const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  images: [{ type: String }],
  featured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tags: [{ type: String }]
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ featured: 1 });

module.exports = mongoose.model('Product', productSchema);
