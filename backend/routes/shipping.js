const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');

// Default shipping configurations (used as fallback if no DB rates configured)
const DEFAULT_SHIPPING_METHODS = [
  {
    method: 'standard',
    label: 'Standard Shipping',
    baseRate: 5.99,
    perPoundRate: 0.50,
    freeShippingThreshold: 75,
    estimatedDaysMin: 5,
    estimatedDaysMax: 7,
  },
  {
    method: 'expedited',
    label: 'Expedited Shipping',
    baseRate: 14.99,
    perPoundRate: 0.75,
    freeShippingThreshold: null,
    estimatedDaysMin: 2,
    estimatedDaysMax: 3,
  },
  {
    method: 'overnight',
    label: 'Overnight Shipping',
    baseRate: 29.99,
    perPoundRate: 1.00,
    freeShippingThreshold: null,
    estimatedDaysMin: 1,
    estimatedDaysMax: 1,
  },
];

// Weight in pounds per item if not specified (default backdrop/electronics weight)
const DEFAULT_ITEM_WEIGHT_LBS = 1.5;

/**
 * Validates a US zip code
 */
function isValidZipCode(zip) {
  return /^\d{5}(-\d{4})?$/.test(zip);
}

/**
 * Determines a zone multiplier based on zip code prefix.
 * Simulates regional shipping zones without a real carrier API.
 */
function getZoneMultiplier(zipCode) {
  const prefix = parseInt(zipCode.substring(0, 3), 10);
  // Far West (AK, HI, Pacific): 900-999
  if (prefix >= 900 && prefix <= 999) return 1.4;
  // Mountain West: 800-899
  if (prefix >= 800 && prefix <= 899) return 1.2;
  // South Central / Plains: 600-799
  if (prefix >= 600 && prefix <= 799) return 1.1;
  // Southeast: 300-499
  if (prefix >= 300 && prefix <= 499) return 1.05;
  // Northeast / Mid-Atlantic: 000-299
  if (prefix >= 0 && prefix <= 299) return 1.15;
  // Default
  return 1.0;
}

/**
 * Calculate total weight from items array.
 * Each item may carry a weight property (from product); otherwise use default.
 */
async function calculateTotalWeight(items) {
  let totalWeight = 0;

  for (const item of items) {
    const quantity = item.quantity || 1;
    let itemWeight = DEFAULT_ITEM_WEIGHT_LBS;

    // Try to get weight from the item directly
    if (item.weight && typeof item.weight === 'number') {
      itemWeight = item.weight;
    } else if (item.productId) {
      try {
        const product = await Product.findById(item.productId).select('weight').lean();
        if (product && product.weight) {
          itemWeight = product.weight;
        }
      } catch (e) {
        // Use default weight if product not found
      }
    }

    totalWeight += itemWeight * quantity;
  }

  return totalWeight;
}

/**
 * Calculate order subtotal from items array.
 */
async function calculateSubtotal(items) {
  let subtotal = 0;

  for (const item of items) {
    const quantity = item.quantity || 1;
    let price = 0;

    if (item.price && typeof item.price === 'number') {
      price = item.price;
    } else if (item.productId) {
      try {
        const product = await Product.findById(item.productId).select('price').lean();
        if (product && product.price) {
          price = product.price;
        }
      } catch (e) {
        // Use 0 if product not found
      }
    }

    subtotal += price * quantity;
  }

  return subtotal;
}

/**
 * Calculate shipping cost for a given method configuration.
 */
function calculateShippingCost(methodConfig, totalWeightLbs, subtotal, zoneMultiplier) {
  // Check free shipping threshold
  if (
    methodConfig.freeShippingThreshold !== null &&
    methodConfig.freeShippingThreshold !== undefined &&
    subtotal >= methodConfig.freeShippingThreshold
  ) {
    return 0;
  }

  const weightCost = totalWeightLbs * methodConfig.perPoundRate;
  const rawCost = (methodConfig.baseRate + weightCost) * zoneMultiplier;

  // Round to 2 decimal places
  return Math.round(rawCost * 100) / 100;
}

/**
 * POST /api/shipping/calculate
 * Body: { items: [{ productId, variantId, quantity, price?, weight? }], zipCode: string }
 * Response: { rates: [{ method, label, cost, estimatedDays, isFree }] }
 */
router.post('/calculate', async (req, res) => {
  try {
    const { items, zipCode } = req.body;

    // Validate required fields
    if (!zipCode) {
      return res.status(400).json({ message: 'zipCode is required' });
    }

    if (!isValidZipCode(String(zipCode))) {
      return res.status(400).json({ message: 'Invalid zip code format. Must be a valid US zip code (e.g. 12345 or 12345-6789)' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items must be a non-empty array' });
    }

    // Validate each item has at minimum a quantity
    for (const item of items) {
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
        return res.status(400).json({ message: 'Each item must have a valid quantity (positive integer)' });
      }
    }

    // Calculate total weight and subtotal
    const [totalWeightLbs, subtotal] = await Promise.all([
      calculateTotalWeight(items),
      calculateSubtotal(items),
    ]);

    // Get zone multiplier based on zip code
    const zoneMultiplier = getZoneMultiplier(String(zipCode));

    // Try to load shipping methods from DB, fall back to defaults
    let shippingMethods = DEFAULT_SHIPPING_METHODS;
    try {
      const ShippingRate = require('../models/ShippingRate');
      const dbRates = await ShippingRate.find({ isActive: true }).lean();
      if (dbRates && dbRates.length > 0) {
        shippingMethods = dbRates;
      }
    } catch (e) {
      // ShippingRate model not available or DB error — use defaults
    }

    // Build rates array
    const rates = shippingMethods.map((method) => {
      const cost = calculateShippingCost(method, totalWeightLbs, subtotal, zoneMultiplier);
      const isFree = cost === 0;

      let estimatedDelivery;
      if (method.estimatedDaysMin === method.estimatedDaysMax) {
        estimatedDelivery = `${method.estimatedDaysMin} business day${method.estimatedDaysMin > 1 ? 's' : ''}`;
      } else {
        estimatedDelivery = `${method.estimatedDaysMin}-${method.estimatedDaysMax} business days`;
      }

      return {
        method: method.method,
        label: method.label,
        cost,
        estimatedDays: {
          min: method.estimatedDaysMin,
          max: method.estimatedDaysMax,
        },
        estimatedDelivery,
        isFree,
        ...(isFree && method.freeShippingThreshold
          ? { freeShippingMessage: `Free shipping on orders over $${method.freeShippingThreshold}` }
          : {}),
      };
    });

    return res.status(200).json({
      rates,
      calculationDetails: {
        totalWeightLbs: Math.round(totalWeightLbs * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        zipCode: String(zipCode),
        itemCount: items.reduce((sum, i) => sum + (i.quantity || 1), 0),
      },
    });
  } catch (err) {
    console.error('Shipping calculation error:', err);
    return res.status(500).json({ message: 'Failed to calculate shipping rates' });
  }
});

module.exports = router;
