const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/check', (req, res) => {
  const { q } = req.query;
  const isAvailable = Math.random() > 0.5;

  res.json({
    domain: q,
    available: isAvailable,
    price: 12.99,
    currency: 'USD',
    suggestions: [
      { domain: `${q}.net`, price: 10.99, available: true },
      { domain: `${q}.org`, price: 11.99, available: true },
      { domain: `get${q}`, price: 12.99, available: true }
    ]
  });
});

router.use(authenticateToken);

router.get('/', (req, res) => {
  res.json([
    {
      id: 1,
      name: 'example.com',
      status: 'active',
      expires: '2025-12-28',
      autoRenew: true,
      privacy: true,
      locked: true,
      nameservers: ['ns1.example.com', 'ns2.example.com']
    },
    {
      id: 2,
      name: 'mydomain.net',
      status: 'active',
      expires: '2025-06-15',
      autoRenew: false,
      privacy: false,
      locked: false,
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com']
    }
  ]);
});

router.get('/auctions', (req, res) => {
  const { sort } = req.query;

  res.json([
    {
      id: 1,
      domain: 'coolstartup.com',
      currentBid: 1250,
      timeLeft: '2d 5h',
      valuation: 2500,
      bids: 12
    },
    {
      id: 2,
      domain: 'techbiz.io',
      currentBid: 850,
      timeLeft: '5d 12h',
      valuation: 1800,
      bids: 8
    }
  ]);
});

router.post('/auctions/:id/bid', (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  res.json({
    success: true,
    auctionId: id,
    yourBid: amount,
    status: 'leading',
    message: 'Bid placed successfully'
  });
});

router.get('/:domain', (req, res) => {
  const { domain } = req.params;

  res.json({
    id: 1,
    name: domain,
    status: 'active',
    expires: '2025-12-28',
    autoRenew: true,
    privacy: true,
    locked: true,
    nameservers: ['ns1.example.com', 'ns2.example.com'],
    contactInfo: {
      registrant: {
        name: 'John Doe',
        organization: 'Acme Corp',
        email: 'john@example.com',
        phone: '+1.5555551234'
      }
    }
  });
});

router.put('/:domain/settings', (req, res) => {
  const { domain } = req.params;
  const { autoRenew, locked } = req.body;

  res.json({
    message: 'Settings updated successfully',
    domain,
    autoRenew,
    locked
  });
});

router.put('/:domain/nameservers', (req, res) => {
  const { domain } = req.params;
  const { nameservers } = req.body;

  res.json({
    message: 'Nameservers updated successfully',
    domain,
    nameservers
  });
});

router.get('/:domain/dns', (req, res) => {
  const { domain } = req.params;

  res.json([
    { id: 1, type: 'A', host: '@', value: '192.0.2.1', ttl: 3600 },
    { id: 2, type: 'A', host: 'www', value: '192.0.2.1', ttl: 3600 },
    { id: 3, type: 'MX', host: '@', value: 'mail.example.com', ttl: 3600, priority: 10 },
    { id: 4, type: 'TXT', host: '@', value: 'v=spf1 include:_spf.example.com ~all', ttl: 3600 }
  ]);
});

router.post('/:domain/dns', (req, res) => {
  const { domain } = req.params;
  const { type, host, value, ttl, priority } = req.body;

  res.json({
    id: Date.now(),
    type,
    host,
    value,
    ttl,
    priority,
    message: 'DNS record created successfully'
  });
});

router.put('/:domain/dns/:recordId', (req, res) => {
  const { domain, recordId } = req.params;
  const { type, host, value, ttl } = req.body;

  res.json({
    id: recordId,
    type,
    host,
    value,
    ttl,
    message: 'DNS record updated successfully'
  });
});

router.delete('/:domain/dns/:recordId', (req, res) => {
  const { recordId } = req.params;

  res.json({ message: `DNS record ${recordId} deleted successfully` });
});

router.get('/:domain/auth-code', (req, res) => {
  const { domain } = req.params;

  res.json({
    domain,
    authCode: 'ABC123XYZ789',
    message: 'EPP/Auth code retrieved successfully'
  });
});

module.exports = router;
