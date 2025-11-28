const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/accounts', (req, res) => {
  res.json([
    {
      id: 'wh_1',
      domain: 'mysite.example.com',
      username: 'user_12345',
      status: 'active',
      plan: 'premium'
    },
    {
      id: 'wh_2',
      domain: 'testsite.rf.gd',
      username: 'user_67890',
      status: 'active',
      plan: 'free'
    }
  ]);
});

router.post('/accounts', (req, res) => {
  const { domain, password, plan } = req.body;

  res.status(201).json({
    id: `wh_${Date.now()}`,
    username: `user_${Date.now()}`,
    status: 'provisioning',
    domain,
    plan,
    message: 'Account is being created. This may take a few minutes.'
  });
});

router.get('/accounts/:id', (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    domain: 'mysite.example.com',
    username: 'user_12345',
    status: 'active',
    plan: 'premium',
    ftpDetails: {
      host: 'ftp.example.com',
      port: 21,
      username: 'user_12345',
      homeDirectory: '/htdocs'
    },
    mysqlDetails: {
      host: 'mysql.example.com',
      port: 3306,
      databases: [
        { name: 'user_12345_db1', username: 'user_12345' }
      ]
    },
    stats: {
      diskUsed: '500MB',
      diskLimit: '10GB',
      bandwidth: '2GB',
      bandwidthLimit: '100GB'
    }
  });
});

router.post('/accounts/:id/deactivate', (req, res) => {
  const { id } = req.params;

  res.json({
    message: 'Account deactivated successfully',
    accountId: id,
    status: 'inactive'
  });
});

router.get('/ssl', (req, res) => {
  res.json([
    {
      id: 'ssl_1',
      domain: 'mysite.example.com',
      status: 'active',
      provider: 'Let\'s Encrypt',
      expiresAt: '2025-03-28'
    },
    {
      id: 'ssl_2',
      domain: 'www.mysite.example.com',
      status: 'active',
      provider: 'Let\'s Encrypt',
      expiresAt: '2025-03-28'
    }
  ]);
});

router.post('/ssl', (req, res) => {
  const { domain, provider } = req.body;

  res.status(201).json({
    id: `ssl_${Date.now()}`,
    domain,
    status: 'provisioning',
    provider: provider || 'Let\'s Encrypt',
    message: 'SSL certificate is being issued'
  });
});

module.exports = router;
