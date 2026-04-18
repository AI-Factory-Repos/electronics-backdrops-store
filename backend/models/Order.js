const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  name: { type: String },
  image: { type: String }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  street: String,
  city: String,
  state: String,
  zip: String,
  country: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestSessionId: { type: String, default: null },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'payment_failed'],
    default: 'pending'
  },
  shippingAddress: addressSchema,
  shippingMethod: { type: String },
  paymentMethod: { type: String, enum: ['stripe', 'paypal', null], default: null },
  stripePaymentIntentId: { type: String, default: null },
  paypalOrderId: { type: String, default: null },
  tracking: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
