'use strict';

const bcrypt = require('bcryptjs');
const { StagingGuardError, createStagingClient } = require('./staging-db');

async function bootstrapAdmin() {
  const email = process.env.STAGING_ADMIN_EMAIL;
  const password = process.env.STAGING_ADMIN_PASSWORD;
  if (typeof email !== 'string' || !email.trim() || email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new StagingGuardError('STAGING_ADMIN_EMAIL must be a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new StagingGuardError('STAGING_ADMIN_PASSWORD must be 8-72 UTF-8 bytes.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const client = createStagingClient();
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');

    const duplicate = await client.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [normalizedEmail]
    );
    if (duplicate.rowCount) {
      throw new StagingGuardError('Refusing to bootstrap: an account with that email already exists.');
    }

    const users = await client.query('SELECT COUNT(*)::text AS count FROM users');
    if (users.rows[0].count !== '0') {
      throw new StagingGuardError('Refusing to bootstrap: the staging users table must be empty.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ('OCF Staging Administrator', $1, $2, 'admin')`,
      [normalizedEmail, passwordHash]
    );

    await client.query('COMMIT');
    transactionOpen = false;
    console.log('Created the one-time staging administrator. Credentials were not logged.');
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof StagingGuardError) {
      console.error(error.message);
    } else {
      console.error('Staging administrator bootstrap failed; database error details were not logged.');
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {
      console.error('Could not close the staging database connection cleanly.');
      process.exitCode = 1;
    });
  }
}

bootstrapAdmin().catch(error => {
  console.error(error instanceof StagingGuardError ? error.message : 'Staging administrator bootstrap failed; details were not logged.');
  process.exitCode = 1;
});
