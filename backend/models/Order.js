const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: false },
  name: { type: String, required: true },
  variantLabel: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image: { type: String }
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  guestEmail: { type: String },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, required: true, default: 0 },
  tax: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  shippingAddress: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    address1: { type: String, required: true },
    address2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true, default: 'US' },
    phone: { type: String }
  },
  shippingMethod: {
    carrier: { type: String },
    service: { type: String },
    estimatedDays: { type: Number }
  },
  paymentMethod: {
    type: { type: String, enum: ['stripe', 'paypal', 'cod'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    transactionId: { type: String }
  },
  tracking: { type: String },
  notes: { type: String },
  confirmedAt: { type: Date },
  shippedAt: { type: Date },
  deliveredAt: { type: Date }
}, { timestamps: true });

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'paymentMethod.transactionId': 1 });

module.exports = mongoose.model('Order', orderSchema);
