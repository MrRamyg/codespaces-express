const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/invoices', (req, res) => {
  const { year } = req.query;

  const invoices = [
    {
      id: 'INV-001',
      date: '2024-12-01',
      amount: 29.99,
      status: 'paid',
      service: 'Bot Hosting - Premium',
      pdfUrl: '/api/v1/billing/invoices/INV-001/pdf'
    },
    {
      id: 'INV-002',
      date: '2024-11-01',
      amount: 49.99,
      status: 'paid',
      service: 'Domain Registration',
      pdfUrl: '/api/v1/billing/invoices/INV-002/pdf'
    },
    {
      id: 'INV-003',
      date: '2024-10-01',
      amount: 29.99,
      status: 'pending',
      service: 'Bot Hosting - Premium',
      pdfUrl: '/api/v1/billing/invoices/INV-003/pdf'
    }
  ];

  const filtered = year ? invoices.filter(inv => inv.date.startsWith(year)) : invoices;
  res.json(filtered);
});

router.get('/invoices/:id', (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    date: '2024-12-01',
    status: 'paid',
    items: [
      {
        description: 'Bot Hosting - Premium Plan',
        quantity: 1,
        unitPrice: 24.99,
        total: 24.99
      },
      {
        description: 'Additional RAM (2GB)',
        quantity: 1,
        unitPrice: 5.00,
        total: 5.00
      }
    ],
    subtotal: 29.99,
    tax: 0,
    total: 29.99,
    currency: 'USD'
  });
});

router.post('/invoices/:id/pay', (req, res) => {
  const { id } = req.params;

  res.json({
    message: 'Payment processed successfully',
    invoiceId: id,
    status: 'paid',
    transactionId: `TXN-${Date.now()}`
  });
});

router.get('/contracts', (req, res) => {
  const { status } = req.query;

  const contracts = [
    {
      id: 'CTR-001',
      serviceName: 'Bot Hosting Premium',
      type: 'monthly',
      activeSince: '2024-01-15',
      renewsOn: '2025-01-15',
      status: 'active'
    },
    {
      id: 'CTR-002',
      serviceName: 'example.com',
      type: 'yearly',
      activeSince: '2024-06-01',
      renewsOn: '2025-06-01',
      status: 'active'
    },
    {
      id: 'CTR-003',
      serviceName: 'Web Hosting Pro',
      type: 'monthly',
      activeSince: '2023-12-01',
      renewsOn: '2024-12-01',
      status: 'expired'
    }
  ];

  const filtered = status ? contracts.filter(c => c.status === status) : contracts;
  res.json(filtered);
});

router.get('/contracts/:id', (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    serviceName: 'Bot Hosting Premium',
    type: 'monthly',
    activeSince: '2024-01-15',
    renewsOn: '2025-01-15',
    status: 'active',
    details: {
      plan: 'Premium',
      specs: {
        ram: '4GB',
        cpu: '2 vCores',
        disk: '50GB SSD'
      },
      region: 'US-East'
    },
    upgrades: [
      {
        name: 'Pro Plan',
        price: 19.99,
        features: ['8GB RAM', '4 vCores', '100GB SSD']
      }
    ]
  });
});

router.post('/cart/checkout', (req, res) => {
  const { items, couponCode } = req.body;

  res.json({
    orderId: `ORD-${Date.now()}`,
    invoiceId: `INV-${Date.now()}`,
    status: 'pending',
    total: 29.99,
    discount: couponCode ? 5.00 : 0
  });
});

module.exports = router;
