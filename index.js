require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { authenticateToken, optionalAuth } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARE ---

app.use(express.json());

// CORS (adjust origin in production)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests, slow down!' }
});
app.use(globalLimiter);

// --- ROUTES ---

// Root endpoint (public)
app.get('/', (req, res) => {
  res.json({
    message: 'API is running',
    version: 'v1',
    endpoints: {
      account: '/api/v1/account',
      billing: '/api/v1/billing',
      promotions: '/api/v1/promotions',
      domains: '/api/v1/domains',
      bots: '/api/v1/bots',
      webHosting: '/api/v1/web-hosting',
      tools: '/api/v1/tools',
      vpTest: '/api/v1/vp-test'
    }
  });
});

// --- IMPORT ROUTES ---
const accountRoutes = require('./routes/account');
const billingRoutes = require('./routes/billing');
const promotionsRoutes = require('./routes/promotions');
const domainsRoutes = require('./routes/domains');
const botsRoutes = require('./routes/bots');
const webHostingRoutes = require('./routes/web-hosting');
const toolsRoutes = require('./routes/tools');
const vpTestRoutes = require('./routes/vpTest');

// --- PUBLIC ROUTES (OPTIONAL AUTH) ---
app.use('/api/v1/vp-test', optionalAuth, vpTestRoutes);

// --- PROTECTED ROUTES (AUTH REQUIRED) ---
app.use('/api/v1/account', authenticateToken, accountRoutes);
app.use('/api/v1/billing', authenticateToken, billingRoutes);
app.use('/api/v1/promotions', authenticateToken, promotionsRoutes);
app.use('/api/v1/domains', authenticateToken, domainsRoutes);
app.use('/api/v1/bots', authenticateToken, botsRoutes);
app.use('/api/v1/web-hosting', authenticateToken, webHostingRoutes);
app.use('/api/v1/tools', authenticateToken, toolsRoutes);
app.use('/api/v1/vp-info', authenticateToken, vpTestRoutes);

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// --- START SERVER ---
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
  console.log(`Base URL: http://localhost:${port}/api/v1`);
});
