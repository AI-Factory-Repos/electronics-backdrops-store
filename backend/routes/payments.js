const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const Order = require('../models/Order');
const authMiddleware = require('../middleware/auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Optional auth — allow guests
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();
  return authMiddleware(req, res, next);
};

// ---------------------------------------------------------------------------
// Stripe — Create Payment Intent
// POST /api/payments/stripe/intent
// ---------------------------------------------------------------------------
router.post('/stripe/intent', optionalAuth, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ message: 'orderId and amount are required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorisation: authenticated user must own the order, guests matched by guestSessionId header
    if (req.user) {
      if (order.userId && order.userId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else {
      const guestSessionId = req.headers['x-guest-session-id'];
      if (order.guestSessionId && order.guestSessionId !== guestSessionId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // Idempotency: reuse existing intent if already created for this order
    if (order.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      return res.json({ clientSecret: existing.client_secret });
    }

    const amountInCents = Math.round(Number(amount) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: { orderId: orderId.toString() },
      automatic_payment_methods: { enabled: true }
    });

    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe intent error:', err);
    return res.status(500).json({ message: 'Failed to create payment intent', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Stripe — Webhook
// POST /api/payments/stripe/webhook
// Raw body required — registered in server.js before express.json()
// ---------------------------------------------------------------------------
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const orderId = intent.metadata && intent.metadata.orderId;
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { status: 'paid', paymentMethod: 'stripe' });
        console.log(`Order ${orderId} marked as paid via Stripe`);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      const orderId = intent.metadata && intent.metadata.orderId;
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { status: 'payment_failed' });
        console.log(`Order ${orderId} payment failed via Stripe`);
      }
    }
  } catch (err) {
    console.error('Stripe webhook handling error:', err);
    return res.status(500).json({ message: 'Webhook processing error' });
  }

  return res.json({ received: true });
});

// ---------------------------------------------------------------------------
// PayPal helpers
// ---------------------------------------------------------------------------
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`PayPal auth failed: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// PayPal — Create Order
// POST /api/payments/paypal/create
// ---------------------------------------------------------------------------
router.post('/paypal/create', optionalAuth, async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ message: 'orderId and amount are required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user) {
      if (order.userId && order.userId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else {
      const guestSessionId = req.headers['x-guest-session-id'];
      if (order.guestSessionId && order.guestSessionId !== guestSessionId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // Idempotency: reuse existing PayPal order
    if (order.paypalOrderId) {
      return res.json({ paypalOrderId: order.paypalOrderId });
    }

    const accessToken = await getPayPalAccessToken();
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

    const ppResponse = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId.toString(),
            amount: {
              currency_code: 'USD',
              value: Number(amount).toFixed(2)
            }
          }
        ]
      })
    });

    if (!ppResponse.ok) {
      const errText = await ppResponse.text();
      console.error('PayPal create order error:', errText);
      return res.status(502).json({ message: 'PayPal order creation failed', detail: errText });
    }

    const ppData = await ppResponse.json();
    order.paypalOrderId = ppData.id;
    await order.save();

    return res.json({ paypalOrderId: ppData.id });
  } catch (err) {
    console.error('PayPal create error:', err);
    return res.status(500).json({ message: 'Failed to create PayPal order', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PayPal — Capture Payment
// POST /api/payments/paypal/capture
// ---------------------------------------------------------------------------
router.post('/paypal/capture', optionalAuth, async (req, res) => {
  try {
    const { paypalOrderId } = req.body;

    if (!paypalOrderId) {
      return res.status(400).json({ message: 'paypalOrderId is required' });
    }

    const accessToken = await getPayPalAccessToken();
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

    const captureResponse = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!captureResponse.ok) {
      const errText = await captureResponse.text();
      console.error('PayPal capture error:', errText);
      return res.status(502).json({ message: 'PayPal capture failed', detail: errText });
    }

    const captureData = await captureResponse.json();

    // Find and update the order
    const order = await Order.findOne({ paypalOrderId });
    if (order) {
      if (captureData.status === 'COMPLETED') {
        order.status = 'paid';
        order.paymentMethod = 'paypal';
        await order.save();
        console.log(`Order ${order._id} marked as paid via PayPal`);
      }
    }

    return res.json({ status: captureData.status, captureData });
  } catch (err) {
    console.error('PayPal capture error:', err);
    return res.status(500).json({ message: 'Failed to capture PayPal payment', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PayPal — Webhook
// POST /api/payments/paypal/webhook
// ---------------------------------------------------------------------------
router.post('/paypal/webhook', express.json(), async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.event_type;

    if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = event.resource || {};
      // Try to extract our internal orderId from purchase_units reference_id
      const purchaseUnits = resource.purchase_units || [];
      for (const unit of purchaseUnits) {
        const refId = unit.reference_id;
        if (refId) {
          await Order.findByIdAndUpdate(refId, { status: 'paid', paymentMethod: 'paypal' });
          console.log(`Order ${refId} marked as paid via PayPal webhook`);
        }
      }
    } else if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
      const resource = event.resource || {};
      const purchaseUnits = resource.purchase_units || [];
      for (const unit of purchaseUnits) {
        const refId = unit.reference_id;
        if (refId) {
          await Order.findByIdAndUpdate(refId, { status: 'payment_failed' });
          console.log(`Order ${refId} payment failed via PayPal webhook`);
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('PayPal webhook error:', err);
    return res.status(500).json({ message: 'Webhook processing error' });
  }
});

module.exports = router;
