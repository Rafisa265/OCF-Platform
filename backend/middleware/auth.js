// middleware/auth.js
const jwt = require('jsonwebtoken');
const { queryOne } = require('../database/db');

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await queryOne('SELECT id, name, email, role, phone, country FROM users WHERE id = $1', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.id]);
    } catch {}
  }
  next();
};

module.exports = { auth, adminOnly, optionalAuth };
