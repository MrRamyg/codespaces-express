// middleware/auth.js
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// --- CORS Middleware ---
const corsOptions = {
  origin: '*', // replace with allowed domains in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
const enableCors = cors(corsOptions);

// --- Rate Limiter Middleware ---
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // max 60 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  // TODO: Replace with real JWT verification in production
  if (token === process.env.API_TOKEN || token === 'mock-jwt-token') {
    req.user = { id: 1, email: 'user@example.com', name: 'John Doe' };
    return next();
  }

  res.status(403).json({ error: 'Invalid token' });
};

// --- Optional Auth Middleware ---
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token === process.env.API_TOKEN || token === 'mock-jwt-token') {
    req.user = { id: 1, email: 'user@example.com', name: 'John Doe' };
  }
  next();
};

// --- Export all middleware ---
module.exports = {
  enableCors,
  apiLimiter,
  authenticateToken,
  optionalAuth,
};
