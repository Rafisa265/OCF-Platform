'use strict';

const fs = require('fs');
const path = require('path');
const { StagingGuardError, createStagingClient } = require('./staging-db');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const advisoryLockId = 904211731;
const applicationTables = [
  'users', 'categories', 'products', 'bundles', 'orders', 'order_items',
  'reviews', 'wishlists', 'carts', 'contacts', 'newsletter', 'promo_codes',
  'checkout_idempotency'
];

function listMigrations(directory = migrationsDirectory) {
  const files = fs.readdirSync(directory)
    .filter(file => file.endsWith('.sql'))
    .sort();
  const versions = new Set();

  for (const file of files) {
    const match = /^(\d{3})_[a-z0-9][a-z0-9_-]*\.sql$/.exec(file);
    if (!match || versions.has(match[1])) {
      throw new StagingGuardError(`Invalid or duplicate staging migration filename: ${file}.`);
    }
    versions.add(match[1]);
  }

  validateContiguousPrefixes([...versions]);
  if (files.length === 0) {
    throw new StagingGuardError('No staging SQL migrations were found.');
  }

  return files;
}

function validateContiguousPrefixes(versions) {
  if (versions.length < 2) return;

  const numericVersions = versions.map(Number).sort((a, b) => a - b);
  for (let version = numericVersions[0]; version <= numericVersions[numericVersions.length - 1]; version++) {
    if (!versions.includes(String(version).padStart(3, '0'))) {
      throw new StagingGuardError(
        `Staging migration prefix ${String(version).padStart(3, '0')} is missing between existing migrations.`
      );
    }
  }
}

function validateMigrationHistory(files, rows) {
  const currentByVersion = new Map(files.map(file => [file.slice(0, 3), file]));
  const recordedVersions = new Set();

  for (const row of rows) {
    if (typeof row.version !== 'string' || !/^\d{3}$/.test(row.version)) {
      throw new StagingGuardError('Staging migration history contains an invalid version value.');
    }
    if (recordedVersions.has(row.version)) {
      throw new StagingGuardError(`Staging migration history contains duplicate version ${row.version}.`);
    }
    recordedVersions.add(row.version);

    const expectedName = currentByVersion.get(row.version);
    if (!expectedName) {
      throw new StagingGuardError(`Staging migration history contains unknown version ${row.version}.`);
    }
    if (row.name !== expectedName) {
      throw new StagingGuardError(`Recorded filename for staging migration ${row.version} does not match the current file.`);
    }
  }

  let pendingMigrationSeen = false;
  for (const file of files) {
    const version = file.slice(0, 3);
    if (!recordedVersions.has(version)) {
      pendingMigrationSeen = true;
    } else if (pendingMigrationSeen) {
      throw new StagingGuardError('Staging migration history has a gap; inspect it manually before continuing.');
    }
  }

  return recordedVersions;
}

function validateTrackingTable(columns, constraints) {
  const expectedColumns = {
    id: { type: 'integer', nullable: 'NO', defaultPrefix: "nextval('" },
    version: { type: 'character varying', maxLength: 255, nullable: 'NO' },
    name: { type: 'character varying', maxLength: 255, nullable: 'NO' },
    applied_at: { type: 'timestamp with time zone', nullable: 'YES', defaultPrefix: 'now()' }
  };
  const columnsByName = new Map(columns.map(column => [column.column_name, column]));

  if (columnsByName.size !== Object.keys(expectedColumns).length) {
    throw new StagingGuardError('Existing public.schema_migrations has an incompatible column set; inspect it manually.');
  }

  for (const [name, expected] of Object.entries(expectedColumns)) {
    const actual = columnsByName.get(name);
    if (!actual ||
        actual.data_type !== expected.type ||
        actual.is_nullable !== expected.nullable ||
        (expected.maxLength && Number(actual.character_maximum_length) !== expected.maxLength) ||
        (expected.defaultPrefix && !String(actual.column_default || '').startsWith(expected.defaultPrefix))) {
      throw new StagingGuardError(`Existing public.schema_migrations column ${name} is incompatible; inspect it manually.`);
    }
  }

  const expectedConstraints = new Map([
    ['PRIMARY KEY', 'id'],
    ['UNIQUE', 'version']
  ]);
  if (!Array.isArray(constraints) || constraints.length !== expectedConstraints.size) {
    throw new StagingGuardError('Existing public.schema_migrations has unexpected or ambiguous constraints; inspect it manually.');
  }

  const foundConstraints = new Set();
  for (const constraint of constraints) {
    const expectedColumn = expectedConstraints.get(constraint.constraint_type);
    if (constraint.table_schema !== 'public' ||
        constraint.table_name !== 'schema_migrations' ||
        !expectedColumn ||
        foundConstraints.has(constraint.constraint_type) ||
        !Array.isArray(constraint.columns) ||
        constraint.columns.length !== 1 ||
        constraint.columns[0] !== expectedColumn) {
      throw new StagingGuardError('Existing public.schema_migrations has unexpected or ambiguous constraints; inspect it manually.');
    }
    foundConstraints.add(constraint.constraint_type);
  }
  if (foundConstraints.size !== expectedConstraints.size) {
    throw new StagingGuardError('Existing public.schema_migrations lacks the required id primary key or unique version constraint.');
  }
}

async function cleanupStagingClient(client, lockAcquired) {
  const failures = [];

  if (lockAcquired) {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId]);
    } catch {
      failures.push('Could not confirm release of the staging migration advisory lock.');
    }
  }

  try {
    await client.end();
  } catch {
    failures.push('Could not close the staging migration database client cleanly.');
  }

  return failures;
}

async function connectStagingClient(client) {
  try {
    await client.connect();
    return { connected: true, cleanupFailures: [] };
  } catch {
    return {
      connected: false,
      cleanupFailures: await cleanupStagingClient(client, false)
    };
  }
}

async function ensureTrackingTable(client) {
  const trackingTable = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
  );

  if (trackingTable.rows[0].exists) {
    const columns = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    `);
    const constraints = await client.query(`
      SELECT tc.constraint_type, tc.table_schema, tc.table_name,
             array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_catalog = tc.constraint_catalog
       AND kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'schema_migrations'
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
      GROUP BY tc.constraint_type, tc.constraint_name, tc.table_schema, tc.table_name
    `);
    validateTrackingTable(columns.rows, constraints.rows);
    return;
  }

  const existingApplicationTables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name = ANY($1::text[])
    LIMIT 1
  `, [applicationTables]);
  if (existingApplicationTables.rowCount > 0) {
    throw new StagingGuardError('Staging schema exists without migration history; refusing automatic migration. Inspect it manually.');
  }

  await client.query('BEGIN');
  let commitStarted = false;
  try {
    await client.query(`
      CREATE TABLE schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    commitStarted = true;
    await client.query('COMMIT');
  } catch {
    try {
      await client.query('ROLLBACK');
    } catch {
      throw new StagingGuardError('Migration-history table creation failed and rollback could not be confirmed. Inspect staging manually.');
    }
    if (commitStarted) {
      throw new StagingGuardError('Migration-history table creation has an ambiguous COMMIT outcome. Inspect staging manually.');
    }
    throw new StagingGuardError('Migration-history table creation failed and was rolled back.');
  }

  const columns = await client.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  `);
  const constraints = await client.query(`
    SELECT tc.constraint_type, tc.table_schema, tc.table_name,
           array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_catalog = tc.constraint_catalog
     AND kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'schema_migrations'
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
      GROUP BY tc.constraint_type, tc.constraint_name, tc.table_schema, tc.table_name
  `);
  validateTrackingTable(columns.rows, constraints.rows);
}

async function runStagingMigrations() {
  const files = listMigrations();
  const client = createStagingClient();
  const connection = await connectStagingClient(client);
  if (!connection.connected) {
    console.error('Staging migration runner failed; database details were not logged.');
    connection.cleanupFailures.forEach(message => console.error(message));
    process.exitCode = 1;
    return;
  }

  let lockAcquired = false;
  let primaryError;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId]);
    lockAcquired = true;

    await ensureTrackingTable(client);
    const appliedResult = await client.query('SELECT version, name FROM schema_migrations');
    const appliedVersions = validateMigrationHistory(files, appliedResult.rows);
    let appliedCount = 0;

    for (const file of files) {
      const version = file.slice(0, 3);
      if (appliedVersions.has(version)) {
        console.log(`Skipping already recorded staging migration ${file}.`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      let commitStarted = false;
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
        commitStarted = true;
        await client.query('COMMIT');
        appliedCount++;
      } catch {
        try {
          await client.query('ROLLBACK');
        } catch {
          throw new StagingGuardError(
            `Staging migration ${file} failed and rollback could not be confirmed. Inspect the staging schema before retrying.`
          );
        }
        if (commitStarted) {
          throw new StagingGuardError(
            `Staging migration ${file} has an ambiguous COMMIT outcome. Inspect migration history and schema before retrying.`
          );
        }
        throw new StagingGuardError(
          `Staging migration ${file} failed and its transaction was rolled back. Inspect the staging schema before retrying.`
        );
      }
      console.log(`Applied staging migration ${file}.`);
    }

    console.log(appliedCount === 0
      ? 'Staging schema is up to date.'
      : `Applied ${appliedCount} staging migration(s).`);
  } catch (error) {
    primaryError = error;
  }

  const cleanupFailures = await cleanupStagingClient(client, lockAcquired);
  if (primaryError) {
    if (primaryError instanceof StagingGuardError) {
      console.error(primaryError.message);
    } else {
      console.error('Staging migration runner failed; database details were not logged.');
    }
    cleanupFailures.forEach(message => console.error(message));
    process.exitCode = 1;
  } else if (cleanupFailures.length > 0) {
    cleanupFailures.forEach(message => console.error(message));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStagingMigrations().catch(() => {
    console.error('Staging migration runner failed; database details were not logged.');
    process.exitCode = 1;
  });
}

module.exports = {
  cleanupStagingClient,
  connectStagingClient,
  listMigrations,
  validateContiguousPrefixes,
  validateMigrationHistory,
  validateTrackingTable
};