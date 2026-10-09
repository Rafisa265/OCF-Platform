'use strict';

const { Client } = require('pg');

class StagingGuardError extends Error {}

function createStagingClient() {
  if (process.env.OCF_STAGING_ONLY !== 'YES') {
    throw new StagingGuardError('Set OCF_STAGING_ONLY=YES to confirm this is an intentional staging operation.');
  }

  const connectionString = process.env.OCF_STAGING_DATABASE_URL;
  if (typeof connectionString !== 'string' || !connectionString || connectionString !== connectionString.trim()) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL is required and must not contain surrounding whitespace.');
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL must be a valid PostgreSQL URL; its value will not be displayed.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hash) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL must be a PostgreSQL URL without a fragment.');
  }
  if (parsed.port && parsed.port !== '5432') {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL must use the standard PostgreSQL port.');
  }
  if (['host', 'hostaddr', 'service', 'database', 'dbname', 'port'].some(key => parsed.searchParams.has(key))) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL must not override its host, port, or database through query parameters.');
  }

  const allowedHost = process.env.OCF_STAGING_ALLOWED_DATABASE_HOST;
  if (typeof allowedHost !== 'string' ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+neon\.tech$/.test(allowedHost)) {
    throw new StagingGuardError('OCF_STAGING_ALLOWED_DATABASE_HOST must be an exact lowercase Neon hostname without wildcards.');
  }
  if (allowedHost.split('.').some(label => label.endsWith('-pooler'))) {
    throw new StagingGuardError('One-time staging database operations require the Neon Direct endpoint; pooled endpoints are not supported.');
  }

  if (parsed.hostname !== allowedHost) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL hostname does not match the independently configured staging allowlist.');
  }

  const allowedDatabaseName = process.env.OCF_STAGING_ALLOWED_DATABASE_NAME;
  if (typeof allowedDatabaseName !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(allowedDatabaseName)) {
    throw new StagingGuardError('OCF_STAGING_ALLOWED_DATABASE_NAME must be an exact PostgreSQL database name without wildcards.');
  }

  const databasePath = parsed.pathname;
  if (!databasePath.startsWith('/') ||
      databasePath.length < 2 ||
      databasePath.slice(1).includes('/') ||
      databasePath.includes('\\') ||
      /%(?:2f|5c)/i.test(databasePath)) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL must contain one database path segment without encoded separators.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(databasePath.slice(1));
  } catch {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL contains a malformed database name.');
  }
  if (databaseName !== allowedDatabaseName) {
    throw new StagingGuardError('OCF_STAGING_DATABASE_URL database name does not match the independently configured staging allowlist.');
  }

  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  });
}

module.exports = { StagingGuardError, createStagingClient };
