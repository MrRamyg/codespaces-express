const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, (req, res) => {
  res.json([
    {
      id: 1,
      title: 'Welcome Bonus',
      description: 'Get 20% off your first purchase',
      code: 'WELCOME20',
      type: 'percentage',
      discountValue: 20
    },
    {
      id: 2,
      title: 'Holiday Special',
      description: '$10 off orders over $50',
      code: 'HOLIDAY10',
      type: 'fixed',
      discountValue: 10
    },
    {
      id: 3,
      title: 'Bot Hosting Promo',
      description: '3 months for the price of 2',
      code: 'BOT3FOR2',
      type: 'custom',
      discountValue: 33.33
    }
  ]);
});

router.post('/validate', (req, res) => {
  const { code, cartItems } = req.body;

  const validCodes = {
    'WELCOME20': { valid: true, discountAmount: 20, description: '20% off applied' },
    'HOLIDAY10': { valid: true, discountAmount: 10, description: '$10 off applied' },
    'BOT3FOR2': { valid: true, discountAmount: 33.33, description: '33% discount applied' }
  };

  if (validCodes[code]) {
    res.json(validCodes[code]);
  } else {
    res.json({ valid: false, discountAmount: 0, description: 'Invalid promo code' });
  }
});

module.exports = router;
