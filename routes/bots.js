const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');

router.get('/plans', optionalAuth, (req, res) => {
  res.json([
    {
      id: 'basic',
      name: 'Basic',
      priceMonthly: 9.99,
      specs: {
        ram: '1GB',
        cpu: '1 vCore',
        disk: '10GB SSD'
      },
      features: ['24/7 Uptime', 'Basic Support', '1 Bot Instance']
    },
    {
      id: 'premium',
      name: 'Premium',
      priceMonthly: 24.99,
      specs: {
        ram: '4GB',
        cpu: '2 vCores',
        disk: '50GB SSD'
      },
      features: ['24/7 Uptime', 'Priority Support', '5 Bot Instances', 'Auto Backups']
    },
    {
      id: 'pro',
      name: 'Pro',
      priceMonthly: 49.99,
      specs: {
        ram: '8GB',
        cpu: '4 vCores',
        disk: '100GB SSD'
      },
      features: ['24/7 Uptime', 'Dedicated Support', 'Unlimited Instances', 'Auto Backups', 'DDoS Protection']
    }
  ]);
});

router.get('/nodes', (req, res) => {
  res.json([
    {
      id: 1,
      name: 'US-East-1',
      country: 'United States',
      region: 'Virginia',
      status: 'online',
      load: 45
    },
    {
      id: 2,
      name: 'US-West-1',
      country: 'United States',
      region: 'California',
      status: 'online',
      load: 62
    },
    {
      id: 3,
      name: 'EU-Central-1',
      country: 'Germany',
      region: 'Frankfurt',
      status: 'online',
      load: 38
    },
    {
      id: 4,
      name: 'ASIA-1',
      country: 'Singapore',
      region: 'Singapore',
      status: 'maintenance',
      load: 0
    }
  ]);
});

router.use(authenticateToken);

router.get('/instances', (req, res) => {
  res.json([
    {
      id: 'inst_1',
      name: 'Discord Bot - Main',
      status: 'running',
      ip: '192.0.2.10',
      port: 25565,
      plan: 'Premium',
      region: 'US-East-1'
    },
    {
      id: 'inst_2',
      name: 'Telegram Bot',
      status: 'stopped',
      ip: '192.0.2.11',
      port: 25566,
      plan: 'Basic',
      region: 'EU-Central-1'
    }
  ]);
});

router.get('/instances/:id', (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    name: 'Discord Bot - Main',
    status: 'running',
    credentials: {
      panelUrl: 'https://panel.example.com',
      username: 'user_12345',
      password: 'temp_password_xyz'
    },
    stats: {
      cpu: 25,
      ram: 1024,
      disk: 2048,
      uptime: '15d 6h 23m'
    },
    ip: '192.0.2.10',
    port: 25565
  });
});

router.post('/instances/:id/power', (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  res.json({
    message: `Instance ${action} command sent successfully`,
    instanceId: id,
    action,
    newStatus: action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'restarting'
  });
});

router.post('/deploy', (req, res) => {
  const { orderId, planId, region, image, gitConfig } = req.body;

  res.json({
    instanceId: `inst_${Date.now()}`,
    status: 'provisioning',
    message: 'Bot instance is being deployed',
    estimatedTime: '2-5 minutes'
  });
});

module.exports = router;
