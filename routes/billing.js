const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});
router.use(authenticateToken);

// GET /invoices?year=YYYY
router.get('/invoices', async (req, res) => {
  try {
    const { year } = req.query;
    const userId = req.user.id;

    let query = 'SELECT * FROM invoices WHERE user_id = $1';
    const params = [userId];

    if (year) {
      query += ' AND EXTRACT(YEAR FROM date) = $2';
      params.push(Number(year));
    }

    query += ' ORDER BY date DESC';

    const { rows } = await pool.query(query, params);

    const invoices = rows.map(inv => ({
      id: inv.invoice_number,
      date: inv.date,
      amount: inv.total,
      status: inv.status,
      service: 'See invoice items',
      pdfUrl: `/api/v1/billing/invoices/${inv.invoice_number}/pdf`
    }));

    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /invoices/:id
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rows: invoices } = await pool.query(
      'SELECT * FROM invoices WHERE invoice_number = $1 AND user_id = $2',
      [id, userId]
    );

    if (!invoices[0]) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoices[0];

    const { rows: items } = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [invoice.id]
    );

    res.json({
      id: invoice.invoice_number,
      date: invoice.date,
      status: invoice.status,
      items: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        total: Number(item.total)
      })),
      subtotal: Number(invoice.subtotal),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      currency: invoice.currency
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST /invoices/:id/pay
router.post('/invoices/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rowCount } = await pool.query(
      'UPDATE invoices SET status = $1 WHERE invoice_number = $2 AND user_id = $3',
      ['paid', id, userId]
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Invoice not found' });

    res.json({
      message: 'Payment processed successfully',
      invoiceId: id,
      status: 'paid',
      transactionId: `TXN-${Date.now()}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// GET /contracts?status=active|expired
router.get('/contracts', async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user.id;

    let query = 'SELECT * FROM contracts WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY active_since DESC';

    const { rows } = await pool.query(query, params);

    res.json(rows.map(c => ({
      id: c.contract_number,
      serviceName: c.service_name,
      type: c.type,
      activeSince: c.active_since,
      renewsOn: c.renews_on,
      status: c.status
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// GET /contracts/:id
router.get('/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rows: contracts } = await pool.query(
      'SELECT * FROM contracts WHERE contract_number = $1 AND user_id = $2',
      [id, userId]
    );

    if (!contracts[0]) return res.status(404).json({ error: 'Contract not found' });

    const contract = contracts[0];

    const { rows: upgrades } = await pool.query(
      'SELECT * FROM contract_upgrades WHERE contract_id = $1',
      [contract.id]
    );

    res.json({
      id: contract.contract_number,
      serviceName: contract.service_name,
      type: contract.type,
      activeSince: contract.active_since,
      renewsOn: contract.renews_on,
      status: contract.status,
      details: {
        plan: contract.plan,
        specs: {
          ram: contract.ram,
          cpu: contract.cpu,
          disk: contract.disk
        },
        region: contract.region
      },
      upgrades: upgrades.map(u => ({
        name: u.name,
        price: Number(u.price),
        features: u.features
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// POST /cart/checkout
router.post('/cart/checkout', async (req, res) => {
  try {
    const { items, couponCode } = req.body;
    const userId = req.user.id;

    const { rows: invoiceRows } = await pool.query(
      'INSERT INTO invoices (invoice_number, user_id, subtotal, tax, total) VALUES ($1, $2, $3, $4, $5) RETURNING invoice_number, id',
      [`INV-${Date.now()}`, userId, 29.99, 0, 29.99]
    );

    const invoice = invoiceRows[0];

    const { rows: orderRows } = await pool.query(
      'INSERT INTO orders (order_number, invoice_id, user_id, total, discount) VALUES ($1, $2, $3, $4, $5) RETURNING order_number',
      [`ORD-${Date.now()}`, invoice.id, userId, 29.99, couponCode ? 5.0 : 0]
    );

    res.json({
      orderId: orderRows[0].order_number,
      invoiceId: invoice.invoice_number,
      status: 'pending',
      total: 29.99,
      discount: couponCode ? 5.0 : 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to checkout cart' });
  }
});

module.exports = router;
