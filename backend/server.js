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
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => {
    const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error('FRONTEND_URL must contain exact HTTP(S) origins only.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== normalized) {
      throw new Error('FRONTEND_URL must contain exact HTTP(S) origins only.');
    }
    return parsed.origin;
  });

const developmentOrigins = process.env.NODE_ENV === 'production' ? [] : [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];
const allowedOrigins = new Set([...developmentOrigins, ...configuredOrigins]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        return callback(new Error('Blocked by CORS policy'));
      }
      if (parsed.origin === origin && parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        return callback(null, true);
      }
    }
    callback(new Error('Blocked by CORS policy'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 1000 }));
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
  const code = typeof err?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(err.code)
    ? ` (code ${err.code})`
    : '';
  console.error(`Request failed${code}`);
  if (res.headersSent) return next(err);
  if (err.message === 'Blocked by CORS policy') {
    return res.status(403).json({ error: 'Origin not allowed by CORS' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
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
    const code = typeof err?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(err.code)
      ? ` (code ${err.code})`
      : '';
    console.error(`Failed to start server${code}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
module.exports = app;
