const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'user@example.com' && password === 'password123') {
    res.json({
      token: 'mock-jwt-token',
      user: {
        id: 1,
        name: 'John Doe',
        email: 'user@example.com',
        company: 'Acme Corp',
        avatarUrl: 'https://i.pravatar.cc/150?u=1'
      }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/register', (req, res) => {
  const { name, email, password, company } = req.body;

  res.status(201).json({
    token: 'mock-jwt-token',
    user: {
      id: 2,
      name,
      email,
      company: company || null,
      avatarUrl: `https://i.pravatar.cc/150?u=${email}`
    }
  });
});

module.exports = router;
