const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const pool = require('../db'); // PostgreSQL pool, see note below

// GET /plans
router.get('/plans', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY name');
    res.json(rows.map(plan => ({
      id: plan.id,
      name: plan.name,
      priceMonthly: Number(plan.price_monthly),
      specs: {
        ram: plan.ram,
        cpu: plan.cpu,
        disk: plan.disk
      },
      features: plan.features
    })));
  } catch (err) {
    console.error('Failed to fetch plans:', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// GET /nodes
router.get('/nodes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nodes ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch nodes:', err);
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});

router.use(authenticateToken);

// GET /instances
router.get('/instances', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.name, i.status, i.ip, i.port, p.name AS plan, n.name AS region
       FROM instances i
       LEFT JOIN plans p ON i.plan_id = p.id
       LEFT JOIN nodes n ON i.node_id = n.id
       WHERE i.user_id = $1`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch instances:', err);
    res.status(500).json({ error: 'Failed to fetch instances' });
  }
});

// GET /instances/:id
router.get('/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT i.*, p.name AS plan_name, n.name AS region
       FROM instances i
       LEFT JOIN plans p ON i.plan_id = p.id
       LEFT JOIN nodes n ON i.node_id = n.id
       WHERE i.id = $1 AND i.user_id = $2`,
      [id, req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Instance not found' });

    const inst = rows[0];
    res.json({
      id: inst.id,
      name: inst.name,
      status: inst.status,
      credentials: {
        panelUrl: 'https://panel.example.com',
        username: req.user.email,
        password: '*****'
      },
      stats: {
        cpu: inst.cpu_usage,
        ram: inst.ram_usage,
        disk: inst.disk_usage,
        uptime: inst.uptime
      },
      ip: inst.ip,
      port: inst.port,
      plan: inst.plan_name,
      region: inst.region
    });
  } catch (err) {
    console.error('Failed to fetch instance:', err);
    res.status(500).json({ error: 'Failed to fetch instance' });
  }
});

// POST /instances/:id/power
router.post('/instances/:id/power', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  // TODO: Hook into your provisioning or VM manager
  res.json({
    message: `Instance ${action} command sent successfully`,
    instanceId: id,
    action,
    newStatus: action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'restarting'
  });
});

// POST /deploy
router.post('/deploy', async (req, res) => {
  try {
    const { orderId, planId, region, image, gitConfig } = req.body;

    // Insert deployment record
    const { rows } = await pool.query(
      `INSERT INTO deployments(user_id, plan_id, region, image, git_config, status, estimated_time)
       VALUES($1, $2, $3, $4, $5, 'provisioning', '2-5 minutes') RETURNING id`,
      [req.user.id, planId, region, image, gitConfig || {}]
    );

    const deploymentId = rows[0].id;

    // TODO: Trigger async provisioning, then update instances table

    res.json({
      instanceId: deploymentId,
      status: 'provisioning',
      message: 'Bot instance is being deployed',
      estimatedTime: '2-5 minutes'
    });
  } catch (err) {
    console.error('Failed to deploy instance:', err);
    res.status(500).json({ error: 'Failed to deploy instance' });
  }
});

module.exports = router;
