const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/me', (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      balance: 125.50,
      currency: 'USD',
      avatarUrl: 'https://i.pravatar.cc/150?u=1',
      company: 'Acme Corp',
      contactPreferences: {
        newsletter: true,
        promotions: false,
        updates: true
      }
    }
  });
});

router.put('/me', (req, res) => {
  const { name, company, contactPreferences, dataPreferences } = req.body;

  res.json({
    user: {
      id: req.user.id,
      name: name || req.user.name,
      email: req.user.email,
      company: company || 'Acme Corp',
      contactPreferences: contactPreferences || {},
      dataPreferences: dataPreferences || {}
    }
  });
});

router.get('/security/activity', (req, res) => {
  res.json([
    {
      id: 1,
      service: 'Web Portal',
      date: '2024-12-28T10:30:00Z',
      ip: '192.168.1.1',
      status: 'success',
      method: 'password'
    },
    {
      id: 2,
      service: 'API',
      date: '2024-12-27T14:20:00Z',
      ip: '192.168.1.1',
      status: 'success',
      method: 'token'
    },
    {
      id: 3,
      service: 'Web Portal',
      date: '2024-12-26T09:15:00Z',
      ip: '203.0.113.45',
      status: 'failed',
      method: 'password'
    }
  ]);
});

router.get('/security/sessions', (req, res) => {
  res.json([
    {
      id: 'sess_1',
      deviceName: 'Chrome on Windows',
      location: 'San Francisco, US',
      current: true
    },
    {
      id: 'sess_2',
      deviceName: 'Safari on iPhone',
      location: 'San Francisco, US',
      current: false
    }
  ]);
});

router.delete('/security/sessions/:id', (req, res) => {
  const { id } = req.params;
  res.json({ message: `Session ${id} revoked successfully` });
});

module.exports = router;
