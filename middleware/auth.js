const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  if (token === 'mock-jwt-token') {
    req.user = { id: 1, email: 'user@example.com', name: 'John Doe' };
    next();
  } else {
    res.status(403).json({ error: 'Invalid token' });
  }
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token === 'mock-jwt-token') {
    req.user = { id: 1, email: 'user@example.com', name: 'John Doe' };
  }
  next();
};

module.exports = { authenticateToken, optionalAuth };
