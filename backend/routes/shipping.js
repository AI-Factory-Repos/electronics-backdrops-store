const express = require('express');
const router = express.Router();
const ShippingRate = require('../models/ShippingRate');

// POST /api/shipping/calculate
router.post('/calculate', async (req, res) => {
  try {
    const { items, zipCode } = req.body;
    if (!items || !items.length) return res.status(400).json({ message: 'Items are required' });

    const rates = await ShippingRate.find({ isActive: true });

    const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

    const calculatedRates = rates.map(rate => {
      let cost = rate.baseRate + rate.perItemRate * totalQuantity;
      return {
        id: rate._id,
        name: rate.name,
        carrier: rate.carrier,
        method: rate.method,
        estimatedDays: rate.estimatedDays,
        cost: parseFloat(cost.toFixed(2)),
        free: rate.freeShippingThreshold != null && cost >= rate.freeShippingThreshold
      };
    });

    res.json({ rates: calculatedRates });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
