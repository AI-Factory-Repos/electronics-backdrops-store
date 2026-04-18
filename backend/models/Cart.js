const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
  quantity: { type: Number, required: true, min: 1, default: 1 }
}, { _id: true });

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestSessionId: { type: String, default: null },
  items: [cartItemSchema]
}, { timestamps: true });

cartSchema.index({ userId: 1 }, { sparse: true });
cartSchema.index({ guestSessionId: 1 }, { sparse: true });

module.exports = mongoose.model('Cart', cartSchema);
