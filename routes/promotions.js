const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();
const { optionalAuth } = require('../middleware/auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// GET /promotions
router.get('/', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM promotions;');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /promotions/validate
router.post('/validate', async (req, res) => {
  const { code, cartItems } = req.body;

  try {
    const result = await pool.query('SELECT * FROM promotions WHERE code=$1', [code]);
    if (result.rows.length === 0) {
      return res.json({ valid: false, discountAmount: 0, description: 'Invalid promo code' });
    }

    const promo = result.rows[0];
    const discountAmount = promo.discountvalue; 

    res.json({
      valid: true,
      discountAmount,
      description: `${discountAmount}${promo.type === 'percentage' ? '%' : '$'} discount applied`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
