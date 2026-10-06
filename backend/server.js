// server.js — OCF Backend Server
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { getDB } = require('./database/db');
const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── SECURITY HEADERS ─────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows media in /uploads to load cross-origin
  contentSecurityPolicy: false // Retains compatibility with frontend inline scripts/styles
}));

// ─── CORS ─────────────────────────────────────
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  ...configuredOrigins
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
    // Support Cloudflare Pages preview/branch subdomains if a .pages.dev domain is configured
    if (configuredOrigins.some(u => u.includes('.pages.dev')) && /^https:\/\/[a-z0-9-.]+\.pages\.dev$/i.test(normalizedOrigin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Blocked by CORS policy'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve uploaded files securely (configurable via UPLOADS_DIR for persistent disks)
const UPLOADS_PATH = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');

app.use('/uploads', express.static(UPLOADS_PATH, {
  dotfiles: 'ignore',
  maxAge: '1d'
}));

// ─── API ROUTES ──────────────────────────────
app.use('/api', routes);

// ─── ERROR HANDLER ───────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  if (err.message === 'Blocked by CORS policy') {
    return res.status(403).json({ error: 'Origin not allowed by CORS' });
  }
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// ─── START ───────────────────────────────────
async function start() {
  try {
    // Enforce production JWT secret hygiene
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('change_in_production')) {
        console.error('❌ FATAL: Insecure or default JWT_SECRET detected in production environment.');
        process.exit(1);
      }
    }

    await getDB(); // Initialize database
    app.listen(PORT, () => {
      console.log(`\n🌿 OCF API Server running on http://localhost:${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`\n📌 Key Endpoints:`);
      console.log(`   GET  http://localhost:${PORT}/api/health`);
      console.log(`   GET  http://localhost:${PORT}/api/products`);
      console.log(`   GET  http://localhost:${PORT}/api/products/best-sellers`);
      console.log(`   GET  http://localhost:${PORT}/api/bundles`);
      console.log(`   POST http://localhost:${PORT}/api/auth/login`);
      console.log(`   POST http://localhost:${PORT}/api/auth/register`);
      console.log(`   POST http://localhost:${PORT}/api/orders`);
      console.log(`   GET  http://localhost:${PORT}/api/admin/dashboard\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
module.exports = app;
