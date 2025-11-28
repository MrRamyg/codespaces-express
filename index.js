require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;
const aiClient = require('./utils/ai');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const billingRoutes = require('./routes/billing');
const promotionsRoutes = require('./routes/promotions');
const domainsRoutes = require('./routes/domains');
const botsRoutes = require('./routes/bots');
const webHostingRoutes = require('./routes/web-hosting');
const toolsRoutes = require('./routes/tools');

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'API is running',
    version: 'v1',
    endpoints: {
      auth: '/api/v1/auth',
      account: '/api/v1/account',
      billing: '/api/v1/billing',
      promotions: '/api/v1/promotions',
      domains: '/api/v1/domains',
      bots: '/api/v1/bots',
      webHosting: '/api/v1/web-hosting',
      tools: '/api/v1/tools'
    }
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/promotions', promotionsRoutes);
app.use('/api/v1/domains', domainsRoutes);
app.use('/api/v1/bots', botsRoutes);
app.use('/api/v1/web-hosting', webHostingRoutes);
app.use('/api/v1/tools', toolsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
  console.log(`Base URL: http://localhost:${port}/api/v1`);
})
