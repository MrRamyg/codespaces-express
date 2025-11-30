const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { Pool } = require('pg');
const { deployInstance } = require('../helpers/pterodactyl');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// GET /plans
router.get('/plans', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans ORDER BY name');
    res.json(rows.map(plan => ({
      id: plan.id,
      name: plan.name,
      priceMonthly: Number(plan.price_monthly),
      specs: { ram: plan.ram, cpu: plan.cpu, disk: plan.disk },
      features: plan.features
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// GET /nodes
router.get('/nodes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nodes ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});



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
    console.error(err);
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
      credentials: { panelUrl: 'https://panel.example.com', username: req.user.email, password: '*****' },
      stats: { cpu: inst.cpu_usage, ram: inst.ram_usage, disk: inst.disk_usage, uptime: inst.uptime },
      ip: inst.ip,
      port: inst.port,
      plan: inst.plan_name,
      region: inst.region
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch instance' });
  }
});

// POST /instances/:id/power
router.post('/instances/:id/power', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const result = await ptero.powerAction(id, action);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to perform power action' });
  }
});
const ptero = require('../helpers/pterodactyl');


router.post('/deploy', async (req, res) => {
  try {
    const body = req.body || {};

    // basic validation
    if (!body.userEmail) return res.status(400).json({ success: false, error: 'userEmail is required' });
    if (!body.eggId) return res.status(400).json({ success: false, error: 'eggId (programming language) is required' });
    if (!body.nodeId) return res.status(400).json({ success: false, error: 'nodeId is required' });

    // call helper
    const result = await deployInstance({
      userEmail: body.userEmail,
      eggId: Number(body.eggId),
      nodeId: Number(body.nodeId),
      name: body.name,
      startup: body.startup,
      image: body.image,
      envArray: body.envArray,
      envObject: body.envObject,
      limits: body.limits,
      feature_limits: body.feature_limits,
      allocationId: body.allocationId,
      notifyEmail: body.notifyEmail,
      discordWebhook: body.discordWebhook,
      gitConfig: body.gitConfig
    });

    return res.json({ success: true, result });
  } catch (err) {
    console.error('deploy route error:', err?.message || err);
    return res.status(500).json({ success: false, error: err.message, pelican: err.pelicanResponse || null });
  }
});


router.use(authenticateToken);

module.exports = router;
